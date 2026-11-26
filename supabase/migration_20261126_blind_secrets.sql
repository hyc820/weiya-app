-- ============================================
-- 2026-11-26 盲盒真实信息隔离 + 收紧表权限
-- 1) 新增 auction_item_secrets：存真实名称/图片/描述，匿名不可读
-- 2) auction_items 对盲盒只保留「盲盒N」，真实信息不再写入该表
-- 3) 撤销 anon/authenticated 对 auction_items 的直接 SELECT
-- 4) 对外展示统一走 auction_items_public 视图
-- 5) 管理员通过 RPC 读取真实信息（仅 admin 角色）
-- ============================================

-- 1. 真实信息表
CREATE TABLE IF NOT EXISTS public.auction_item_secrets (
    item_id UUID PRIMARY KEY REFERENCES public.auction_items(id) ON DELETE CASCADE,
    real_name TEXT NOT NULL,
    real_image_url TEXT,
    real_description TEXT
);

ALTER TABLE public.auction_item_secrets ENABLE ROW LEVEL SECURITY;
-- 不创建任何策略：anon / authenticated 无法直接读取

-- 2. 存量数据补录（所有商品都补，便于管理员接口统一读取）
INSERT INTO public.auction_item_secrets(item_id, real_name, real_image_url, real_description)
SELECT id, item_name, image_url, description
FROM public.auction_items
ON CONFLICT (item_id) DO NOTHING;

-- 3. 盲盒在基础表中只保留「盲盒N」
UPDATE public.auction_items
SET item_name = '盲盒' || blind_no,
    image_url = NULL,
    description = NULL
WHERE is_blind = true;

-- 4. 对外视图：结标后拼接真实名称
DROP VIEW IF EXISTS public.auction_items_public;

CREATE VIEW public.auction_items_public AS
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

-- 5. 撤销基础表读取权限（视图不受影响，视图以属主权限执行）
REVOKE SELECT ON public.auction_items FROM anon, authenticated;

-- 6. 创建商品：盲盒只写盲盒编号，真实名称写入 secrets
DROP FUNCTION IF EXISTS public.create_auction_item(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN);

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 管理员读取商品真实信息
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 结标流水使用真实名称
CREATE OR REPLACE FUNCTION public.settle_auction(itm_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_winner_id UUID;
    v_win_pts INTEGER;
    v_name TEXT;
    v_item_name TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.auction_items WHERE id = itm_id AND status = 'active'
    ) THEN
        RETURN '该商品无需结标';
    END IF;

    SELECT employee_id, bid_points INTO v_winner_id, v_win_pts
    FROM public.auction_bids
    WHERE item_id = itm_id AND status = 'active'
    ORDER BY bid_points DESC, created_at ASC
    LIMIT 1;

    IF v_winner_id IS NULL THEN
        UPDATE public.auction_items SET status = 'settled' WHERE id = itm_id;
        RETURN '流标（无人出价）';
    END IF;

    UPDATE public.auction_bids
    SET status = 'won'
    WHERE item_id = itm_id AND employee_id = v_winner_id;

    UPDATE public.auction_bids
    SET status = 'lost'
    WHERE item_id = itm_id AND employee_id != v_winner_id;

    UPDATE public.employees
    SET current_points = current_points - v_win_pts,
        locked_points = locked_points - v_win_pts
    WHERE id = v_winner_id;

    SELECT name INTO v_name FROM public.employees WHERE id = v_winner_id;

    SELECT COALESCE(s.real_name, a.item_name) INTO v_item_name
    FROM public.auction_items a
    LEFT JOIN public.auction_item_secrets s ON s.item_id = a.id
    WHERE a.id = itm_id;

    INSERT INTO public.point_history(employee_id, points, point_type, reference, operator)
    VALUES (v_winner_id, -v_win_pts, 'auction', v_item_name, '系统');

    INSERT INTO public.auction_winners(item_id, employee_id, win_points)
    VALUES (itm_id, v_winner_id, v_win_pts);

    UPDATE public.employees e
    SET locked_points = e.locked_points - b.bid_points
    FROM public.auction_bids b
    WHERE b.item_id = itm_id
      AND b.status = 'lost'
      AND e.id = b.employee_id;

    UPDATE public.auction_items SET status = 'settled' WHERE id = itm_id;

    RETURN '结标完成，得标者：' || v_name || '，出价：' || v_win_pts || '分';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
