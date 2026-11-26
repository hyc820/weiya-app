-- ============================================
-- 2026-11-26 竞标规则调整
-- 1) 出价可修改，但只能上调，不能下调或持平
-- 2) 新增出价流水表，记录每一次出价（用于出价总次数与明细）
-- 3) 新增出价详情查询函数：结标后所有人可看，管理员竞拍期间即可看
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 出价流水表（每次提交出价都留痕）
-- ============================================
CREATE TABLE IF NOT EXISTS public.auction_bid_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.auction_items(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    bid_points INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bid_logs_item_time
    ON public.auction_bid_logs(item_id, created_at DESC);

ALTER TABLE public.auction_bid_logs ENABLE ROW LEVEL SECURITY;
-- 不开放直接读取：详情统一通过 get_auction_bid_detail 按权限返回

-- 存量出价补录为流水（幂等，可重复执行）
INSERT INTO public.auction_bid_logs(item_id, employee_id, bid_points, created_at)
SELECT b.item_id, b.employee_id, b.bid_points, b.created_at
FROM public.auction_bids b
WHERE NOT EXISTS (
    SELECT 1 FROM public.auction_bid_logs l
    WHERE l.item_id = b.item_id
      AND l.employee_id = b.employee_id
      AND l.bid_points = b.bid_points
      AND l.created_at = b.created_at
);

-- ============================================
-- 2. 出价函数：只能上调 + 写入流水
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
    SELECT status, base_points INTO v_status, v_base
    FROM public.auction_items WHERE id = itm_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION '商品不存在';
    END IF;
    IF v_status != 'active' THEN
        RAISE EXCEPTION '该商品竞标未开始或已结束';
    END IF;

    IF bid_pts < v_base THEN
        RAISE EXCEPTION '出价不可低于起标分 %', v_base;
    END IF;

    -- 加行锁，获取员工当前积分
    SELECT current_points, locked_points INTO v_current, v_locked
    FROM public.employees WHERE id = emp_id FOR UPDATE;

    -- 检查是否已有出价（无记录时 INTO 会置为 NULL）
    SELECT bid_points INTO v_old_bid
    FROM public.auction_bids
    WHERE item_id = itm_id AND employee_id = emp_id AND status = 'active';

    -- 修改出价只能往上加
    IF v_old_bid IS NOT NULL AND bid_pts <= v_old_bid THEN
        RAISE EXCEPTION '出价只能上调：当前出价 % 分，新出价须高于此金额', v_old_bid;
    END IF;

    -- 新的冻结总额 = 原冻结 - 旧出价 + 新出价
    v_total_locked := v_locked - COALESCE(v_old_bid, 0) + bid_pts;

    IF (v_current - v_total_locked) < 0 THEN
        RAISE EXCEPTION '积分不足，可用积分：%', (v_current - v_locked);
    END IF;

    IF v_old_bid IS NOT NULL THEN
        UPDATE public.auction_bids
        SET bid_points = bid_pts, created_at = now()
        WHERE item_id = itm_id AND employee_id = emp_id AND status = 'active';
    ELSE
        INSERT INTO public.auction_bids(item_id, employee_id, bid_points)
        VALUES (itm_id, emp_id, bid_pts);
    END IF;

    -- 记录本次出价流水
    INSERT INTO public.auction_bid_logs(item_id, employee_id, bid_points)
    VALUES (itm_id, emp_id, bid_pts);

    UPDATE public.employees
    SET locked_points = v_total_locked
    WHERE id = emp_id;

    RETURN QUERY
    SELECT current_points, locked_points, (current_points - locked_points)
    FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. 出价详情：结标后对所有人开放，管理员竞拍期间即可查看
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
