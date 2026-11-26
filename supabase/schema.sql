-- ============================================
-- 尾牙积分竞技暨竞标平台 - 数据库 Schema
-- 数据库：Supabase (PostgreSQL)
-- 高并发设计：所有积分操作用事务/锁保证原子性
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. employees - 员工表
-- ============================================
CREATE TABLE public.employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_no TEXT NOT NULL UNIQUE,        -- 工号，如 EMP001
    name TEXT NOT NULL,                       -- 姓名
    department TEXT,                          -- 部门
    role TEXT NOT NULL DEFAULT 'employee',    -- admin / gamemaster / employee
    current_points INTEGER NOT NULL DEFAULT 0,
    locked_points INTEGER NOT NULL DEFAULT 0,
    rank_no INTEGER,
    has_checked_in BOOLEAN NOT NULL DEFAULT false,
    check_in_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. point_history - 积分记录表
-- ============================================
CREATE TABLE public.point_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,                  -- 正=加分，负=扣分
    point_type TEXT NOT NULL,                 -- checkin / game / auction / admin / redeem
    reference TEXT,                           -- 游戏名、商品名等
    operator TEXT NOT NULL,                   -- 操作人姓名
    remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_point_history_employee ON public.point_history(employee_id, created_at DESC);

-- ============================================
-- 3. game_record - 游戏闯关记录表
-- ============================================
CREATE TABLE public.game_record (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    game_name TEXT NOT NULL,                  -- 套圈圈/飞镖/九宫格投球/神射手/趣味闯关
    points INTEGER NOT NULL,
    operator TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(employee_id, game_name)            -- 防重复加分
);

-- ============================================
-- 4. auction_items - 竞标商品表
-- ============================================
CREATE TABLE public.auction_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_no TEXT NOT NULL UNIQUE,             -- 商品编号
    item_name TEXT NOT NULL,
    image_url TEXT,
    description TEXT,
    base_points INTEGER NOT NULL,             -- 起标积分
    quantity INTEGER NOT NULL DEFAULT 1,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending / active / settled / cancelled
    is_blind BOOLEAN NOT NULL DEFAULT false,  -- 是否盲盒竞拍
    blind_no INTEGER,                         -- 盲盒编号（全局递增，不复用）
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_auction_items_blind_no
    ON public.auction_items(blind_no)
    WHERE blind_no IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.auction_blind_no_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.auction_item_no_seq START WITH 1;

-- ============================================
-- 5. auction_bids - 出价记录表
-- ============================================
CREATE TABLE public.auction_bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.auction_items(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    bid_points INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',    -- active / won / lost / withdrawn
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(item_id, employee_id)              -- 同员工同商品只能一条出价
);
CREATE INDEX idx_bids_item ON public.auction_bids(item_id);
CREATE INDEX idx_bids_employee ON public.auction_bids(employee_id);

-- ============================================
-- 5-1. auction_bid_logs - 出价流水表（每次出价留痕）
-- ============================================
CREATE TABLE public.auction_bid_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.auction_items(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    bid_points INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bid_logs_item_time ON public.auction_bid_logs(item_id, created_at DESC);

-- ============================================
-- 6. auction_winners - 得标结果表
-- ============================================
CREATE TABLE public.auction_winners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.auction_items(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    win_points INTEGER NOT NULL,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 7. announcements - 活动公告表
-- ============================================
CREATE TABLE public.announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 8. system_logs - 系统日志表
-- ============================================
CREATE TABLE public.system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT NOT NULL,
    operator TEXT NOT NULL,
    target TEXT,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 视图：员工可用积分
-- ============================================
CREATE OR REPLACE VIEW public.employee_points_view AS
SELECT
    id,
    employee_no,
    name,
    department,
    role,
    current_points,
    locked_points,
    (current_points - locked_points) AS available_points,
    rank_no,
    has_checked_in
FROM public.employees;

-- ============================================
-- 表：盲盒真实信息（匿名不可读）
-- ============================================
CREATE TABLE IF NOT EXISTS public.auction_item_secrets (
    item_id UUID PRIMARY KEY REFERENCES public.auction_items(id) ON DELETE CASCADE,
    real_name TEXT NOT NULL,
    real_image_url TEXT,
    real_description TEXT
);
ALTER TABLE public.auction_item_secrets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 视图：竞拍商品对外显示（盲盒未结标隐藏真实名称/图片/描述）
-- ============================================
CREATE OR REPLACE VIEW public.auction_items_public AS
SELECT
    a.id,
    a.item_no,
    CASE
        WHEN a.is_blind AND a.status <> 'settled' THEN '盲盒' || a.blind_no
        WHEN a.is_blind THEN '盲盒' || a.blind_no || '-' || s.real_name
        ELSE a.item_name
    END AS item_name,
    CASE
        WHEN a.is_blind AND a.status <> 'settled' THEN NULL
        WHEN a.is_blind THEN s.real_image_url
        ELSE a.image_url
    END AS image_url,
    CASE
        WHEN a.is_blind AND a.status <> 'settled' THEN NULL
        WHEN a.is_blind THEN s.real_description
        ELSE a.description
    END AS description,
    a.base_points,
    a.quantity,
    a.start_time,
    a.end_time,
    a.status,
    a.created_at,
    a.is_blind,
    a.blind_no
FROM public.auction_items a
LEFT JOIN public.auction_item_secrets s ON s.item_id = a.id;

GRANT SELECT ON public.auction_items_public TO anon, authenticated;

-- 基础表不再对匿名用户开放，商品信息统一走视图/管理员 RPC
REVOKE SELECT ON public.auction_items FROM anon, authenticated;

-- ============================================
-- 函数：签到加积分（事务，原子操作）
-- ============================================
CREATE OR REPLACE FUNCTION public.check_in(emp_id UUID)
RETURNS TABLE(current_pts INTEGER, available_pts INTEGER) AS $$
BEGIN
    -- 检查是否已签到
    IF EXISTS (SELECT 1 FROM public.employees WHERE id = emp_id AND has_checked_in = true) THEN
        RAISE EXCEPTION '该员工已签到';
    END IF;

    -- 原子更新：标记签到 + 加100分
    UPDATE public.employees
    SET has_checked_in = true,
        check_in_time = now(),
        current_points = current_points + 100
    WHERE id = emp_id;

    -- 写入积分记录
    INSERT INTO public.point_history(employee_id, points, point_type, reference, operator)
    VALUES (emp_id, 100, 'checkin', '报到', '系统');

    -- 返回最新积分
    RETURN QUERY
    SELECT current_points, (current_points - locked_points)
    FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：游戏加分（事务，带防重复检查）
-- ============================================
CREATE OR REPLACE FUNCTION public.add_game_point(
    emp_id UUID,
    game TEXT,
    pts INTEGER,
    operator_name TEXT
)
RETURNS TABLE(current_pts INTEGER, available_pts INTEGER) AS $$
BEGIN
    -- 防重复：检查是否已完成该游戏
    IF EXISTS (
        SELECT 1 FROM public.game_record
        WHERE employee_id = emp_id AND game_name = game
    ) THEN
        RAISE EXCEPTION '该员工已完成此游戏，不可重复加分';
    END IF;

    -- 写入游戏记录（UNIQUE 约束兜底）
    INSERT INTO public.game_record(employee_id, game_name, points, operator)
    VALUES (emp_id, game, pts, operator_name);

    -- 原子加分
    UPDATE public.employees
    SET current_points = current_points + pts
    WHERE id = emp_id;

    -- 写入积分记录
    INSERT INTO public.point_history(employee_id, points, point_type, reference, operator)
    VALUES (emp_id, pts, 'game', game, operator_name);

    -- 返回最新积分
    RETURN QUERY
    SELECT current_points, (current_points - locked_points)
    FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：撤销游戏加分（管理员不限；关主限本人 10 分钟内）
-- ============================================
CREATE OR REPLACE FUNCTION public.revoke_game_point(
    p_game_record_id UUID,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_emp_id UUID;
    v_game TEXT;
    v_points INTEGER;
    v_record_operator TEXT;
    v_created TIMESTAMPTZ;
    v_role TEXT;
    v_operator_name TEXT;
    v_current INTEGER;
    v_locked INTEGER;
    v_emp_name TEXT;
BEGIN
    SELECT employee_id, game_name, points, operator, created_at
    INTO v_emp_id, v_game, v_points, v_record_operator, v_created
    FROM public.game_record WHERE id = p_game_record_id;

    IF v_emp_id IS NULL THEN
        RAISE EXCEPTION '该加分记录不存在或已被撤销';
    END IF;

    SELECT role, name INTO v_role, v_operator_name
    FROM public.employees WHERE id = p_operator_id;

    IF COALESCE(v_role, '') = 'admin' THEN
        NULL;
    ELSIF v_role = 'gamemaster' THEN
        IF v_record_operator IS DISTINCT FROM v_operator_name THEN
            RAISE EXCEPTION '只能撤销自己操作的加分';
        END IF;
        IF v_created < now() - interval '10 minutes' THEN
            RAISE EXCEPTION '超过 10 分钟，请联系管理员撤销';
        END IF;
    ELSE
        RAISE EXCEPTION '没有撤销加分的权限';
    END IF;

    SELECT current_points, locked_points, name
    INTO v_current, v_locked, v_emp_name
    FROM public.employees WHERE id = v_emp_id FOR UPDATE;

    IF (v_current - v_points) < v_locked THEN
        RAISE EXCEPTION '该员工积分已被竞标冻结或已使用，无法撤销，请联系管理员手动调整';
    END IF;

    UPDATE public.employees
    SET current_points = current_points - v_points
    WHERE id = v_emp_id;

    DELETE FROM public.game_record WHERE id = p_game_record_id;

    INSERT INTO public.point_history(employee_id, points, point_type, reference, operator, remark)
    VALUES (v_emp_id, -v_points, 'game_revoke', v_game, v_operator_name,
            '撤销游戏加分（原操作人：' || v_record_operator || '）');

    RETURN '已撤销「' || v_game || '」加分 ' || v_points || ' 分，' || v_emp_name || ' 可重新参与该项目';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：提交出价（事务，处理积分冻结）
-- ============================================
CREATE OR REPLACE FUNCTION public.submit_bid(
    emp_id UUID,
    itm_id UUID,
    bid_pts INTEGER
)
RETURNS TABLE(current_pts INTEGER, locked_pts INTEGER, available_pts INTEGER) AS $$
DECLARE
    v_current INTEGER;
    v_locked INTEGER;
    v_base INTEGER;
    v_status TEXT;
    v_old_bid INTEGER;
    v_total_locked INTEGER;
BEGIN
    -- 检查商品状态
    SELECT status, base_points INTO v_status, v_base
    FROM public.auction_items WHERE id = itm_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION '商品不存在';
    END IF;
    IF v_status != 'active' THEN
        RAISE EXCEPTION '该商品竞标未开始或已结束';
    END IF;

    -- 检查出价是否 >= 起标分
    IF bid_pts < v_base THEN
        RAISE EXCEPTION '出价不可低于起标分 %', v_base;
    END IF;

    -- 加行锁，获取员工当前积分
    SELECT current_points, locked_points INTO v_current, v_locked
    FROM public.employees WHERE id = emp_id FOR UPDATE;

    -- 检查是否已有出价
    SELECT bid_points INTO v_old_bid
    FROM public.auction_bids
    WHERE item_id = itm_id AND employee_id = emp_id AND status = 'active';

    -- 修改出价只能往上加
    IF v_old_bid IS NOT NULL AND bid_pts <= v_old_bid THEN
        RAISE EXCEPTION '出价只能上调：当前出价 % 分，新出价须高于此金额', v_old_bid;
    END IF;

    -- 计算新的冻结总额 = 原冻结 - 旧出价 + 新出价
    v_total_locked := v_locked - COALESCE(v_old_bid, 0) + bid_pts;

    -- 检查可用积分是否足够
    IF (v_current - v_total_locked) < 0 THEN
        RAISE EXCEPTION '积分不足，可用积分：%', (v_current - v_locked);
    END IF;

    -- 更新或插入出价记录
    IF v_old_bid IS NOT NULL THEN
        UPDATE public.auction_bids
        SET bid_points = bid_pts, created_at = now()
        WHERE item_id = itm_id AND employee_id = emp_id AND status = 'active';
    ELSE
        INSERT INTO public.auction_bids(item_id, employee_id, bid_points)
        VALUES (itm_id, emp_id, bid_pts);
    END IF;

    -- 记录本次出价流水（用于出价总次数与明细）
    INSERT INTO public.auction_bid_logs(item_id, employee_id, bid_points)
    VALUES (itm_id, emp_id, bid_pts);

    -- 更新员工冻结积分
    UPDATE public.employees
    SET locked_points = v_total_locked
    WHERE id = emp_id;

    -- 返回最新数据
    RETURN QUERY
    SELECT current_points, locked_points, (current_points - locked_points)
    FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：出价详情（结标后所有人可看；管理员竞拍期间即可看）
-- ============================================
CREATE OR REPLACE FUNCTION public.get_auction_bid_detail(
    p_item_id UUID,
    p_viewer_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_status TEXT;
    v_role TEXT;
BEGIN
    SELECT status INTO v_status FROM public.auction_items WHERE id = p_item_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION '商品不存在';
    END IF;

    SELECT role INTO v_role FROM public.employees WHERE id = p_viewer_id;
    IF v_status <> 'settled' AND COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '结标后才能查看出价详情';
    END IF;

    RETURN jsonb_build_object(
        'item_id', p_item_id,
        'status', v_status,
        'bidder_count', (
            SELECT COUNT(DISTINCT b.employee_id)
            FROM public.auction_bids b WHERE b.item_id = p_item_id
        ),
        'bid_count', (
            SELECT COUNT(*)
            FROM public.auction_bid_logs l WHERE l.item_id = p_item_id
        ),
        'highest_bid', (
            SELECT MAX(b.bid_points)
            FROM public.auction_bids b WHERE b.item_id = p_item_id
        ),
        'highest_bidders', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'employee_no', e.employee_no,
                'name', e.name,
                'department', e.department,
                'bid_points', b.bid_points,
                'created_at', b.created_at
            ) ORDER BY b.created_at ASC)
            FROM public.auction_bids b
            JOIN public.employees e ON e.id = b.employee_id
            WHERE b.item_id = p_item_id
              AND b.bid_points = (
                  SELECT MAX(x.bid_points)
                  FROM public.auction_bids x WHERE x.item_id = p_item_id
              )
        ), '[]'::jsonb),
        'winner', (
            SELECT jsonb_build_object(
                'employee_no', e.employee_no,
                'name', e.name,
                'department', e.department,
                'win_points', w.win_points,
                'settled_at', w.settled_at
            )
            FROM public.auction_winners w
            JOIN public.employees e ON e.id = w.employee_id
            WHERE w.item_id = p_item_id
            ORDER BY w.settled_at DESC
            LIMIT 1
        ),
        'bids', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'employee_no', e.employee_no,
                'name', e.name,
                'department', e.department,
                'bid_points', l.bid_points,
                'created_at', l.created_at
            ) ORDER BY l.created_at DESC, l.bid_points DESC)
            FROM public.auction_bid_logs l
            JOIN public.employees e ON e.id = l.employee_id
            WHERE l.item_id = p_item_id
        ), '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：结标（事务，选出最高价，扣分，释放冻结）
-- ============================================
CREATE OR REPLACE FUNCTION public.settle_auction(itm_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_winner_id UUID;
    v_win_pts INTEGER;
    v_current INTEGER;
    v_locked INTEGER;
    v_name TEXT;
BEGIN
    -- 检查商品状态
    IF NOT EXISTS (
        SELECT 1 FROM public.auction_items WHERE id = itm_id AND status = 'active'
    ) THEN
        RETURN '该商品无需结标';
    END IF;

    -- 找最高价（同分取最早提交）
    SELECT employee_id, bid_points INTO v_winner_id, v_win_pts
    FROM public.auction_bids
    WHERE item_id = itm_id AND status = 'active'
    ORDER BY bid_points DESC, created_at ASC
    LIMIT 1;

    IF v_winner_id IS NULL THEN
        -- 流标
        UPDATE public.auction_items SET status = 'settled' WHERE id = itm_id;
        RETURN '流标（无人出价）';
    END IF;

    -- 标记得标者
    UPDATE public.auction_bids
    SET status = 'won'
    WHERE item_id = itm_id AND employee_id = v_winner_id;

    -- 标记未得标者
    UPDATE public.auction_bids
    SET status = 'lost'
    WHERE item_id = itm_id AND employee_id != v_winner_id;

    -- 得标者：扣分 + 释放对应冻结
    UPDATE public.employees
    SET current_points = current_points - v_win_pts,
        locked_points = locked_points - v_win_pts
    WHERE id = v_winner_id;

    -- 得标者写入扣分记录
    SELECT name INTO v_name FROM public.employees WHERE id = v_winner_id;
    INSERT INTO public.point_history(employee_id, points, point_type, reference, operator)
    VALUES (v_winner_id, -v_win_pts, 'auction',
            (SELECT COALESCE(s.real_name, a.item_name)
             FROM public.auction_items a
             LEFT JOIN public.auction_item_secrets s ON s.item_id = a.id
             WHERE a.id = itm_id), '系统');

    -- 写入得标结果
    INSERT INTO public.auction_winners(item_id, employee_id, win_points)
    VALUES (itm_id, v_winner_id, v_win_pts);

    -- 释放未得标者的冻结积分
    UPDATE public.employees e
    SET locked_points = e.locked_points - b.bid_points
    FROM public.auction_bids b
    WHERE b.item_id = itm_id
      AND b.status = 'lost'
      AND e.id = b.employee_id;

    -- 更新商品状态
    UPDATE public.auction_items SET status = 'settled' WHERE id = itm_id;

    RETURN '结标完成，得标者：' || v_name || '，出价：' || v_win_pts || '分';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：管理员删除竞拍商品（进行中先释放冻结积分）
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_auction_item(
    p_item_id UUID,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
    v_name TEXT;
    v_status TEXT;
    v_bid_count INTEGER;
BEGIN
    SELECT item_name, status INTO v_name, v_status
    FROM public.auction_items WHERE id = p_item_id;

    IF v_name IS NULL THEN
        RAISE EXCEPTION '商品不存在';
    END IF;

    SELECT role INTO v_role FROM public.employees WHERE id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以删除竞拍商品';
    END IF;

    IF v_status = 'active' THEN
        UPDATE public.employees e
        SET locked_points = GREATEST(e.locked_points - sub.pts, 0)
        FROM (
            SELECT employee_id, SUM(bid_points) AS pts
            FROM public.auction_bids
            WHERE item_id = p_item_id AND status = 'active'
            GROUP BY employee_id
        ) sub
        WHERE e.id = sub.employee_id;
    END IF;

    SELECT COUNT(*) INTO v_bid_count
    FROM public.auction_bids WHERE item_id = p_item_id;

    DELETE FROM public.auction_items WHERE id = p_item_id;

    RETURN '已删除「' || v_name || '」（清理出价 ' || v_bid_count || ' 条）';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：创建竞拍商品（支持盲盒）
-- ============================================
CREATE OR REPLACE FUNCTION public.create_auction_item(
    p_name TEXT,
    p_base INTEGER,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_is_blind BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_blind_no INTEGER;
    v_is_blind BOOLEAN := COALESCE(p_is_blind, false);
    v_display_name TEXT;
BEGIN
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION '商品名称不能为空';
    END IF;
    IF p_base IS NULL OR p_base < 0 THEN
        RAISE EXCEPTION '起标积分无效';
    END IF;

    IF v_is_blind THEN
        v_blind_no := nextval('public.auction_blind_no_seq');
        v_display_name := '盲盒' || v_blind_no;
    ELSE
        v_display_name := trim(p_name);
    END IF;

    INSERT INTO public.auction_items(
        item_no, item_name, base_points, quantity, start_time, end_time, status, is_blind, blind_no
    ) VALUES (
        'ITEM' || to_char(now(), 'YYMMDDHH24MISS') ||
            lpad(nextval('public.auction_item_no_seq')::text, 3, '0'),
        v_display_name,
        p_base,
        1,
        p_start,
        p_end,
        'active',
        v_is_blind,
        v_blind_no
    ) RETURNING id INTO v_id;

    INSERT INTO public.auction_item_secrets(item_id, real_name)
    VALUES (v_id, trim(p_name));

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：管理员读取商品真实信息
-- ============================================
CREATE OR REPLACE FUNCTION public.get_auction_items_admin(p_operator_id UUID)
RETURNS TABLE(
    id UUID,
    item_no TEXT,
    item_name TEXT,
    image_url TEXT,
    description TEXT,
    base_points INTEGER,
    quantity INTEGER,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status TEXT,
    created_at TIMESTAMPTZ,
    is_blind BOOLEAN,
    blind_no INTEGER
) AS $$
BEGIN
    IF COALESCE((SELECT e.role FROM public.employees e WHERE e.id = p_operator_id), '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以查看商品真实信息';
    END IF;

    RETURN QUERY
    SELECT
        a.id,
        a.item_no,
        COALESCE(s.real_name, a.item_name),
        COALESCE(s.real_image_url, a.image_url),
        COALESCE(s.real_description, a.description),
        a.base_points,
        a.quantity,
        a.start_time,
        a.end_time,
        a.status,
        a.created_at,
        a.is_blind,
        a.blind_no
    FROM public.auction_items a
    LEFT JOIN public.auction_item_secrets s ON s.item_id = a.id
    ORDER BY a.start_time;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_auction_item_admin(
    p_item_id UUID,
    p_operator_id UUID
)
RETURNS TABLE(
    id UUID,
    item_no TEXT,
    item_name TEXT,
    image_url TEXT,
    description TEXT,
    base_points INTEGER,
    quantity INTEGER,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status TEXT,
    created_at TIMESTAMPTZ,
    is_blind BOOLEAN,
    blind_no INTEGER
) AS $$
BEGIN
    IF COALESCE((SELECT e.role FROM public.employees e WHERE e.id = p_operator_id), '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以查看商品真实信息';
    END IF;

    RETURN QUERY
    SELECT
        a.id,
        a.item_no,
        COALESCE(s.real_name, a.item_name),
        COALESCE(s.real_image_url, a.image_url),
        COALESCE(s.real_description, a.description),
        a.base_points,
        a.quantity,
        a.start_time,
        a.end_time,
        a.status,
        a.created_at,
        a.is_blind,
        a.blind_no
    FROM public.auction_items a
    LEFT JOIN public.auction_item_secrets s ON s.item_id = a.id
    WHERE a.id = p_item_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：管理员调整积分
-- ============================================
CREATE OR REPLACE FUNCTION public.adjust_points(
    emp_id UUID,
    pts INTEGER,
    operator_name TEXT,
    remark TEXT
)
RETURNS TABLE(current_pts INTEGER, available_pts INTEGER) AS $$
BEGIN
    UPDATE public.employees
    SET current_points = current_points + pts
    WHERE id = emp_id;

    INSERT INTO public.point_history(employee_id, points, point_type, operator, remark)
    VALUES (emp_id, pts, 'admin', operator_name, remark);

    RETURN QUERY
    SELECT current_points, (current_points - locked_points)
    FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：刷新排行榜
-- ============================================
CREATE OR REPLACE FUNCTION public.refresh_ranking()
RETURNS VOID AS $$
BEGIN
    UPDATE public.employees e
    SET rank_no = sub.rn
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY current_points DESC) AS rn
        FROM public.employees
    ) sub
    WHERE e.id = sub.id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS 行级安全策略
-- ============================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bid_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- 简化策略：通过 Supabase service_role 操作数据（服务端），
-- 前端通过调用我们的 Edge Function / 后端 API 间接操作
-- 这里设置为所有认证用户可读，写操作通过 service_role（服务端）

CREATE POLICY "Allow authenticated read" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON public.point_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON public.game_record FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON public.auction_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON public.auction_bids FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON public.auction_winners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON public.announcements FOR SELECT TO authenticated USING (true);

-- ============================================
-- 测试数据（可选，部署时可删除）
-- ============================================
INSERT INTO public.employees(employee_no, name, department, role) VALUES
('EMP001', '黄有超', 'MCU验证部', 'admin'),
('EMP002', '张三', '行政部', 'gamemaster'),
('EMP003', '李四', '研发部', 'gamemaster'),
('EMP004', '王五', '研发部', 'employee'),
('EMP005', '赵六', '市场部', 'employee');

INSERT INTO public.announcements(title, content, sort_order) VALUES
('欢迎参加2027尾牙', '签到即可获得100积分，玩游戏赚更多积分，用积分竞标奖品！', 1),
('活动流程', '18:00签到 → 18:30闯关游戏 → 20:00积分拍卖 → 21:00结标', 2);

INSERT INTO public.auction_items(item_no, item_name, base_points, quantity, start_time, end_time, status) VALUES
('ITEM001', 'Nintendo Switch', 500, 1, now(), now() + interval '2 hours', 'active'),
('ITEM002', 'AirPods Pro', 300, 1, now(), now() + interval '2 hours', 'active'),
('ITEM003', 'Apple Watch', 400, 1, now(), now() + interval '2 hours', 'pending');
