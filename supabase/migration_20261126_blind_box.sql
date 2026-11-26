-- ============================================
-- 2026-11-26 盲盒竞拍
-- 1) auction_items 增加 is_blind / blind_no
-- 2) 盲盒编号使用数据库序列，删除后不复用
-- 3) 新增对外视图 auction_items_public：未结标盲盒只暴露「盲盒N」并隐藏图片/描述
-- 4) create_auction_item 支持盲盒参数
-- ============================================

ALTER TABLE public.auction_items
    ADD COLUMN IF NOT EXISTS is_blind BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.auction_items
    ADD COLUMN IF NOT EXISTS blind_no INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_items_blind_no
    ON public.auction_items(blind_no)
    WHERE blind_no IS NOT NULL;

-- 全局递增，删除不复用
CREATE SEQUENCE IF NOT EXISTS public.auction_blind_no_seq START WITH 1;

-- 商品编号序列（避免同一秒创建多个商品时编号冲突）
CREATE SEQUENCE IF NOT EXISTS public.auction_item_no_seq START WITH 1;

-- 对外视图：非管理员看到的商品名称
CREATE OR REPLACE VIEW public.auction_items_public AS
SELECT
    id,
    item_no,
    CASE
        WHEN is_blind AND status <> 'settled' THEN '盲盒' || blind_no
        WHEN is_blind THEN '盲盒' || blind_no || '-' || item_name
        ELSE item_name
    END AS item_name,
    CASE WHEN is_blind AND status <> 'settled' THEN NULL ELSE image_url END AS image_url,
    CASE WHEN is_blind AND status <> 'settled' THEN NULL ELSE description END AS description,
    base_points,
    quantity,
    start_time,
    end_time,
    status,
    created_at,
    is_blind,
    blind_no
FROM public.auction_items;

GRANT SELECT ON public.auction_items_public TO anon, authenticated;

-- 创建商品：支持盲盒
DROP FUNCTION IF EXISTS public.create_auction_item(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ);

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
BEGIN
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION '商品名称不能为空';
    END IF;
    IF p_base IS NULL OR p_base < 0 THEN
        RAISE EXCEPTION '起标积分无效';
    END IF;

    IF COALESCE(p_is_blind, false) THEN
        v_blind_no := nextval('public.auction_blind_no_seq');
    END IF;

    INSERT INTO public.auction_items(
        item_no, item_name, base_points, quantity, start_time, end_time, status, is_blind, blind_no
    ) VALUES (
        'ITEM' || to_char(now(), 'YYMMDDHH24MISS') ||
            lpad(nextval('public.auction_item_no_seq')::text, 3, '0'),
        trim(p_name),
        p_base,
        1,
        p_start,
        p_end,
        'active',
        COALESCE(p_is_blind, false),
        v_blind_no
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
