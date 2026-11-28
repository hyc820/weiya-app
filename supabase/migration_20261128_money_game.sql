-- ============================================
-- 2026-11-28 数钱大作战（热场游戏）正式版
-- 说明：
-- 1) 全员手机同局，成绩计入积分；管理员发起、结算
-- 2) 写操作全部通过 RPC 校验管理员（p_operator_id）
-- 3) 表开启 RLS 且不建任何策略：匿名/普通登录用户不能直接读表
-- 4) 结算幂等，按名次区间发放积分并写 point_history
-- ============================================

-- ---------- 表 ----------
CREATE TABLE IF NOT EXISTS public.game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL DEFAULT '数钱大作战',
    duration_seconds INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'waiting',   -- waiting / running / settled / cancelled
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    rewards JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{from,to,points}]
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    CONSTRAINT game_sessions_duration_check CHECK (duration_seconds BETWEEN 10 AND 180)
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created ON public.game_sessions(created_at DESC);

CREATE TABLE IF NOT EXISTS public.game_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    taps INTEGER NOT NULL DEFAULT 0,
    max_combo INTEGER NOT NULL DEFAULT 0,
    reward_points INTEGER NOT NULL DEFAULT 0,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(session_id, employee_id)            -- 同局每人只能提交一次
);
CREATE INDEX IF NOT EXISTS idx_game_scores_rank ON public.game_scores(session_id, score DESC, max_combo DESC, submitted_at ASC);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

-- ---------- 创建比赛（管理员） ----------
CREATE OR REPLACE FUNCTION public.create_game_session(
    p_title TEXT,
    p_duration INTEGER,
    p_rewards JSONB,
    p_operator_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_role TEXT;
    v_item JSONB;
BEGIN
    SELECT role INTO v_role FROM public.employees WHERE id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以创建热场游戏';
    END IF;
    IF p_duration IS NULL OR p_duration NOT BETWEEN 10 AND 180 THEN
        RAISE EXCEPTION '时长需在 10-180 秒之间';
    END IF;
    IF p_rewards IS NULL OR jsonb_typeof(p_rewards) <> 'array' THEN
        p_rewards := '[]'::jsonb;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_rewards) LOOP
        IF (v_item->>'from') IS NULL OR (v_item->>'to') IS NULL OR (v_item->>'points') IS NULL THEN
            RAISE EXCEPTION '奖励配置格式错误，需包含名次区间与积分';
        END IF;
        IF (v_item->>'from')::int < 1 OR (v_item->>'to')::int < (v_item->>'from')::int OR (v_item->>'points')::int < 0 THEN
            RAISE EXCEPTION '奖励配置的名次区间或积分无效';
        END IF;
    END LOOP;

    INSERT INTO public.game_sessions(title, duration_seconds, rewards, created_by)
    VALUES (COALESCE(NULLIF(trim(p_title), ''), '数钱大作战'), p_duration, p_rewards, p_operator_id)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 开始比赛（管理员） ----------
CREATE OR REPLACE FUNCTION public.start_game_session(
    p_session_id UUID,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
    v_status TEXT;
    v_duration INTEGER;
    v_start TIMESTAMPTZ;
BEGIN
    SELECT role INTO v_role FROM public.employees WHERE id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以开始热场游戏';
    END IF;

    SELECT status, duration_seconds INTO v_status, v_duration
    FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION '比赛不存在';
    END IF;
    IF v_status <> 'waiting' THEN
        RAISE EXCEPTION '只有待开始的比赛可以开始（已结束的请复制配置新建一局）';
    END IF;

    DELETE FROM public.game_scores WHERE session_id = p_session_id;

    v_start := now();
    UPDATE public.game_sessions
    SET status = 'running',
        start_at = v_start,
        end_at = v_start + make_interval(secs => v_duration),
        settled_at = NULL
    WHERE id = p_session_id;

    RETURN '比赛已开始，持续 ' || v_duration || ' 秒';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 提前结束（管理员） ----------
CREATE OR REPLACE FUNCTION public.end_game_session(
    p_session_id UUID,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
    v_status TEXT;
BEGIN
    SELECT role INTO v_role FROM public.employees WHERE id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以结束热场游戏';
    END IF;

    SELECT status INTO v_status FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION '比赛不存在';
    END IF;
    IF v_status <> 'running' THEN
        RAISE EXCEPTION '当前比赛不在进行中';
    END IF;

    UPDATE public.game_sessions SET end_at = now() WHERE id = p_session_id;
    RETURN '已提前结束，等待结算';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 结算发奖（管理员，幂等） ----------
CREATE OR REPLACE FUNCTION public.settle_game_session(
    p_session_id UUID,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
    v_admin_name TEXT;
    v_status TEXT;
    v_title TEXT;
    v_rewards JSONB;
    v_count INTEGER := 0;
    v_awarded INTEGER := 0;
    v_total INTEGER := 0;
    rec RECORD;
    v_pts INTEGER;
BEGIN
    SELECT role, name INTO v_role, v_admin_name FROM public.employees WHERE id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以结算热场游戏';
    END IF;

    SELECT status, title, rewards INTO v_status, v_title, v_rewards
    FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION '比赛不存在';
    END IF;
    IF v_status = 'settled' THEN
        RETURN '该局已结算，无需重复操作';
    END IF;
    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION '已取消的比赛不能结算';
    END IF;

    -- 若仍在进行中，定格结束时间
    UPDATE public.game_sessions
    SET end_at = LEAST(COALESCE(end_at, now()), now())
    WHERE id = p_session_id;

    UPDATE public.game_sessions SET status = 'settled', settled_at = now() WHERE id = p_session_id;

    FOR rec IN
        SELECT s.id AS score_id, s.employee_id,
               ROW_NUMBER() OVER (ORDER BY s.score DESC, s.max_combo DESC, s.submitted_at ASC) AS rn
        FROM public.game_scores s
        WHERE s.session_id = p_session_id AND s.is_valid = true
    LOOP
        v_pts := 0;
        SELECT COALESCE((elem->>'points')::int, 0) INTO v_pts
        FROM jsonb_array_elements(v_rewards) elem
        WHERE rec.rn BETWEEN COALESCE((elem->>'from')::int, 99999)
                         AND COALESCE((elem->>'to')::int, 0)
        LIMIT 1;

        IF v_pts IS NULL THEN
            v_pts := 0;
        END IF;

        IF v_pts > 0 THEN
            UPDATE public.game_scores SET reward_points = v_pts WHERE id = rec.score_id;
            UPDATE public.employees SET current_points = current_points + v_pts WHERE id = rec.employee_id;
            INSERT INTO public.point_history(employee_id, points, point_type, reference, operator, remark)
            VALUES (rec.employee_id, v_pts, 'game', '数钱大作战 · ' || v_title, v_admin_name, '第 ' || rec.rn || ' 名');
            v_awarded := v_awarded + 1;
            v_total := v_total + v_pts;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_count FROM public.game_scores WHERE session_id = p_session_id;

    RETURN '结算完成：' || v_count || ' 人参与，' || v_awarded || ' 人获得积分，共发放 ' || v_total || ' 分';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 取消比赛（管理员） ----------
CREATE OR REPLACE FUNCTION public.cancel_game_session(
    p_session_id UUID,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
    v_status TEXT;
BEGIN
    SELECT role INTO v_role FROM public.employees WHERE id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以取消热场游戏';
    END IF;

    SELECT status INTO v_status FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION '比赛不存在';
    END IF;
    IF v_status = 'settled' THEN
        RAISE EXCEPTION '已结算的比赛不能取消';
    END IF;

    UPDATE public.game_sessions
    SET status = 'cancelled', end_at = COALESCE(end_at, now())
    WHERE id = p_session_id;

    RETURN '比赛已取消（不发放积分）';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 删除比赛（管理员） ----------
-- 注意：已结算的比赛删除后不会回收已发放的积分
CREATE OR REPLACE FUNCTION public.delete_game_session(
    p_session_id UUID,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
    v_title TEXT;
BEGIN
    SELECT role INTO v_role FROM public.employees WHERE id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以删除热场游戏';
    END IF;

    DELETE FROM public.game_sessions WHERE id = p_session_id RETURNING title INTO v_title;
    IF v_title IS NULL THEN
        RAISE EXCEPTION '比赛不存在或已被删除';
    END IF;

    RETURN '已删除「' || v_title || '」';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 当前比赛（公开，含服务器时间） ----------
CREATE OR REPLACE FUNCTION public.get_current_game_session()
RETURNS TABLE(
    id UUID,
    title TEXT,
    duration_seconds INTEGER,
    status TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    rewards JSONB,
    settled_at TIMESTAMPTZ,
    server_now TIMESTAMPTZ,
    participant_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.title, s.duration_seconds, s.status, s.start_at, s.end_at, s.rewards,
           s.settled_at, now() AS server_now,
           (SELECT COUNT(*) FROM public.game_scores gs WHERE gs.session_id = s.id) AS participant_count
    FROM public.game_sessions s
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------- 实时榜单（公开） ----------
CREATE OR REPLACE FUNCTION public.get_game_leaderboard(
    p_session_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    rank_no BIGINT,
    employee_id UUID,
    name TEXT,
    department TEXT,
    employee_no TEXT,
    score INTEGER,
    max_combo INTEGER,
    submitted_at TIMESTAMPTZ,
    reward_points INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT ROW_NUMBER() OVER (ORDER BY s.score DESC, s.max_combo DESC, s.submitted_at ASC) AS rank_no,
           e.id, e.name, e.department, e.employee_no,
           s.score, s.max_combo, s.submitted_at, s.reward_points
    FROM public.game_scores s
    JOIN public.employees e ON e.id = s.employee_id
    WHERE s.session_id = p_session_id AND s.is_valid = true
    ORDER BY rank_no
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------- 本局统计（公开） ----------
CREATE OR REPLACE FUNCTION public.get_game_stats(p_session_id UUID)
RETURNS TABLE(
    participant_count BIGINT,
    total_score BIGINT,
    max_combo INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT COUNT(*)::bigint,
           COALESCE(SUM(gs.score), 0)::bigint,
           COALESCE(MAX(gs.max_combo), 0)
    FROM public.game_scores gs
    WHERE gs.session_id = p_session_id AND gs.is_valid = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------- 提交成绩（员工） ----------
CREATE OR REPLACE FUNCTION public.submit_game_score(
    p_session_id UUID,
    p_employee_id UUID,
    p_score INTEGER,
    p_taps INTEGER,
    p_max_combo INTEGER
)
RETURNS TABLE(
    rank_no BIGINT,
    score INTEGER,
    total_players BIGINT,
    reward_points INTEGER
) AS $$
DECLARE
    v_status TEXT;
    v_end TIMESTAMPTZ;
BEGIN
    SELECT status, end_at INTO v_status, v_end
    FROM public.game_sessions WHERE id = p_session_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION '比赛不存在';
    END IF;
    IF v_status <> 'running' THEN
        RAISE EXCEPTION '当前比赛不在进行中';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id) THEN
        RAISE EXCEPTION '员工不存在';
    END IF;
    IF now() > v_end + interval '6 seconds' THEN
        RAISE EXCEPTION '本局已结束，成绩未能提交';
    END IF;
    IF p_score IS NULL OR p_taps IS NULL OR p_max_combo IS NULL
       OR p_score < 0 OR p_taps < 0 OR p_max_combo < 0 THEN
        RAISE EXCEPTION '成绩数据无效';
    END IF;
    IF p_taps > 5000 OR p_max_combo > p_taps OR p_score > p_taps * 200 THEN
        RAISE EXCEPTION '成绩数据异常';
    END IF;

    INSERT INTO public.game_scores(session_id, employee_id, score, taps, max_combo)
    VALUES (p_session_id, p_employee_id, p_score, p_taps, p_max_combo)
    ON CONFLICT (session_id, employee_id) DO NOTHING;

    IF NOT FOUND THEN
        RAISE EXCEPTION '本局成绩已提交，请勿重复提交';
    END IF;

    RETURN QUERY
    WITH ranked AS (
        SELECT s.employee_id,
               ROW_NUMBER() OVER (ORDER BY s.score DESC, s.max_combo DESC, s.submitted_at ASC) AS rn
        FROM public.game_scores s
        WHERE s.session_id = p_session_id AND s.is_valid = true
    )
    SELECT r.rn, p_score,
           (SELECT COUNT(*) FROM public.game_scores WHERE session_id = p_session_id),
           0
    FROM ranked r
    WHERE r.employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 我的本局结果 ----------
CREATE OR REPLACE FUNCTION public.get_my_game_result(
    p_session_id UUID,
    p_employee_id UUID
)
RETURNS TABLE(
    rank_no BIGINT,
    score INTEGER,
    max_combo INTEGER,
    total_players BIGINT,
    reward_points INTEGER,
    submitted_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH ranked AS (
        SELECT s.*,
               ROW_NUMBER() OVER (ORDER BY s.score DESC, s.max_combo DESC, s.submitted_at ASC) AS rn
        FROM public.game_scores s
        WHERE s.session_id = p_session_id AND s.is_valid = true
    )
    SELECT r.rn, r.score, r.max_combo,
           (SELECT COUNT(*) FROM public.game_scores WHERE session_id = p_session_id),
           r.reward_points, r.submitted_at
    FROM ranked r
    WHERE r.employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------- 管理员比赛列表 ----------
CREATE OR REPLACE FUNCTION public.get_game_sessions_admin(
    p_operator_id UUID
)
RETURNS TABLE(
    id UUID,
    title TEXT,
    duration_seconds INTEGER,
    status TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    rewards JSONB,
    created_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    participant_count BIGINT,
    total_score BIGINT,
    top_score INTEGER
) AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.employees e WHERE e.id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以查看热场游戏记录';
    END IF;

    RETURN QUERY
    SELECT s.id, s.title, s.duration_seconds, s.status, s.start_at, s.end_at, s.rewards,
           s.created_at, s.settled_at,
           COALESCE(st.cnt, 0), COALESCE(st.total, 0), COALESCE(st.top, 0)
    FROM public.game_sessions s
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, COALESCE(SUM(score), 0) AS total, COALESCE(MAX(score), 0) AS top
        FROM public.game_scores gs
        WHERE gs.session_id = s.id AND gs.is_valid = true
    ) st ON true
    ORDER BY s.created_at DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
