-- ============================================
-- 2026-11-26 管理员删除竞拍商品
-- 说明：
-- 1) 仅管理员可删除（通过 p_operator_id 校验角色）
-- 2) 进行中的商品：删除前释放所有出价冻结的积分
-- 3) 已结标商品：不自动退还已扣积分（避免误操作改变名次）
-- 4) 出价流水、得标记录随商品级联删除
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

    -- 进行中的商品：释放所有出价冻结的积分
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

    -- 出价、流水、得标记录随商品级联删除
    DELETE FROM public.auction_items WHERE id = p_item_id;

    RETURN '已删除「' || v_name || '」（清理出价 ' || v_bid_count || ' 条）';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
