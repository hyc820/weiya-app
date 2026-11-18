import pg from 'pg'
const { Client } = pg

const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.ojnkdffldoyozvznzosi',
  password: '15659827747o0.',
  ssl: { rejectUnauthorized: false }
})

const sql = `
-- 1. 修复 RLS：允许 anon 和 authenticated 读取
DROP POLICY IF EXISTS "Allow authenticated read" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.point_history;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.game_record;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.auction_items;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.auction_bids;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.auction_winners;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.announcements;
DROP POLICY IF EXISTS "Allow read" ON public.employees;
DROP POLICY IF EXISTS "Allow read" ON public.point_history;
DROP POLICY IF EXISTS "Allow read" ON public.game_record;
DROP POLICY IF EXISTS "Allow read" ON public.auction_items;
DROP POLICY IF EXISTS "Allow read" ON public.auction_bids;
DROP POLICY IF EXISTS "Allow read" ON public.auction_winners;
DROP POLICY IF EXISTS "Allow read" ON public.announcements;

CREATE POLICY "Allow read" ON public.employees FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow read" ON public.point_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow read" ON public.game_record FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow read" ON public.auction_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow read" ON public.auction_bids FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow read" ON public.auction_winners FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow read" ON public.announcements FOR SELECT TO anon, authenticated USING (true);

-- 2. 签到函数（SECURITY DEFINER）
CREATE OR REPLACE FUNCTION public.check_in(emp_id UUID)
RETURNS TABLE(current_pts INTEGER, available_pts INTEGER)
SECURITY DEFINER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.employees WHERE id = emp_id AND has_checked_in = true) THEN
        RAISE EXCEPTION '该员工已签到';
    END IF;
    UPDATE public.employees SET has_checked_in = true, check_in_time = now(), current_points = current_points + 100 WHERE id = emp_id;
    INSERT INTO public.point_history(employee_id, points, point_type, reference, operator) VALUES (emp_id, 100, 'checkin', '报到', '系统');
    RETURN QUERY SELECT current_points, (current_points - locked_points) FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql;

-- 3. 游戏加分函数
CREATE OR REPLACE FUNCTION public.add_game_point(emp_id UUID, game TEXT, pts INTEGER, operator_name TEXT)
RETURNS TABLE(current_pts INTEGER, available_pts INTEGER)
SECURITY DEFINER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.game_record WHERE employee_id = emp_id AND game_name = game) THEN
        RAISE EXCEPTION '该员工已完成此游戏，不可重复加分';
    END IF;
    INSERT INTO public.game_record(employee_id, game_name, points, operator) VALUES (emp_id, game, pts, operator_name);
    UPDATE public.employees SET current_points = current_points + pts WHERE id = emp_id;
    INSERT INTO public.point_history(employee_id, points, point_type, reference, operator) VALUES (emp_id, pts, 'game', game, operator_name);
    RETURN QUERY SELECT current_points, (current_points - locked_points) FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql;

-- 4. 出价函数
CREATE OR REPLACE FUNCTION public.submit_bid(emp_id UUID, itm_id UUID, bid_pts INTEGER)
RETURNS TABLE(current_pts INTEGER, locked_pts INTEGER, available_pts INTEGER)
SECURITY DEFINER AS $$
DECLARE
    v_current INTEGER; v_locked INTEGER; v_base INTEGER; v_status TEXT;
    v_old_bid INTEGER := 0; v_total_locked INTEGER;
BEGIN
    SELECT status, base_points INTO v_status, v_base FROM public.auction_items WHERE id = itm_id;
    IF v_status IS NULL THEN RAISE EXCEPTION '商品不存在'; END IF;
    IF v_status != 'active' THEN RAISE EXCEPTION '该商品竞标未开始或已结束'; END IF;
    IF bid_pts < v_base THEN RAISE EXCEPTION '出价不可低于起标分 %', v_base; END IF;
    SELECT current_points, locked_points INTO v_current, v_locked FROM public.employees WHERE id = emp_id FOR UPDATE;
    SELECT bid_points INTO v_old_bid FROM public.auction_bids WHERE item_id = itm_id AND employee_id = emp_id AND status = 'active';
    v_total_locked := v_locked - COALESCE(v_old_bid, 0) + bid_pts;
    IF (v_current - v_total_locked) < 0 THEN RAISE EXCEPTION '积分不足，可用积分：%', (v_current - v_locked); END IF;
    IF v_old_bid IS NOT NULL THEN
        UPDATE public.auction_bids SET bid_points = bid_pts, created_at = now() WHERE item_id = itm_id AND employee_id = emp_id AND status = 'active';
    ELSE
        INSERT INTO public.auction_bids(item_id, employee_id, bid_points) VALUES (itm_id, emp_id, bid_pts);
    END IF;
    UPDATE public.employees SET locked_points = v_total_locked WHERE id = emp_id;
    RETURN QUERY SELECT current_points, locked_points, (current_points - locked_points) FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql;

-- 5. 结标函数
CREATE OR REPLACE FUNCTION public.settle_auction(itm_id UUID)
RETURNS TEXT
SECURITY DEFINER AS $$
DECLARE
    v_winner_id UUID; v_win_pts INTEGER; v_name TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.auction_items WHERE id = itm_id AND status = 'active') THEN RETURN '该商品无需结标'; END IF;
    SELECT employee_id, bid_points INTO v_winner_id, v_win_pts FROM public.auction_bids WHERE item_id = itm_id AND status = 'active' ORDER BY bid_points DESC, created_at ASC LIMIT 1;
    IF v_winner_id IS NULL THEN
        UPDATE public.auction_items SET status = 'settled' WHERE id = itm_id;
        RETURN '流标（无人出价）';
    END IF;
    UPDATE public.auction_bids SET status = 'won' WHERE item_id = itm_id AND employee_id = v_winner_id;
    UPDATE public.auction_bids SET status = 'lost' WHERE item_id = itm_id AND employee_id != v_winner_id;
    UPDATE public.employees SET current_points = current_points - v_win_pts, locked_points = locked_points - v_win_pts WHERE id = v_winner_id;
    SELECT name INTO v_name FROM public.employees WHERE id = v_winner_id;
    INSERT INTO public.point_history(employee_id, points, point_type, reference, operator) VALUES (v_winner_id, -v_win_pts, 'auction', (SELECT item_name FROM public.auction_items WHERE id = itm_id), '系统');
    INSERT INTO public.auction_winners(item_id, employee_id, win_points) VALUES (itm_id, v_winner_id, v_win_pts);
    UPDATE public.employees e SET locked_points = e.locked_points - b.bid_points FROM public.auction_bids b WHERE b.item_id = itm_id AND b.status = 'lost' AND e.id = b.employee_id;
    UPDATE public.auction_items SET status = 'settled' WHERE id = itm_id;
    RETURN '结标完成，得标者：' || v_name || '，出价：' || v_win_pts || '分';
END;
$$ LANGUAGE plpgsql;

-- 6. 积分调整函数
CREATE OR REPLACE FUNCTION public.adjust_points(emp_id UUID, pts INTEGER, operator_name TEXT, remark TEXT)
RETURNS TABLE(current_pts INTEGER, available_pts INTEGER)
SECURITY DEFINER AS $$
BEGIN
    UPDATE public.employees SET current_points = current_points + pts WHERE id = emp_id;
    INSERT INTO public.point_history(employee_id, points, point_type, operator, remark) VALUES (emp_id, pts, 'admin', operator_name, remark);
    RETURN QUERY SELECT current_points, (current_points - locked_points) FROM public.employees WHERE id = emp_id;
END;
$$ LANGUAGE plpgsql;

-- 7. 刷新排行榜函数
CREATE OR REPLACE FUNCTION public.refresh_ranking()
RETURNS VOID
SECURITY DEFINER AS $$
BEGIN
    UPDATE public.employees e SET rank_no = sub.rn FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY current_points DESC) AS rn FROM public.employees) sub WHERE e.id = sub.id;
END;
$$ LANGUAGE plpgsql;
`

async function main() {
  try {
    await client.connect()
    console.log('✅ 数据库连接成功')
    await client.query(sql)
    console.log('✅ 所有修复脚本执行成功')
    // 验证
    const res = await client.query('SELECT employee_no, name, role FROM public.employees ORDER BY employee_no')
    console.log('员工数据验证：')
    res.rows.forEach(r => console.log(`  ${r.employee_no} - ${r.name} - ${r.role}`))
  } catch (e) {
    console.error('❌ 错误:', e.message)
  } finally {
    await client.end()
  }
}

main()
