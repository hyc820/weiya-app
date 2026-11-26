-- ============================================
-- 2026-11-26 撤销游戏加分
-- 规则：
-- 1) 管理员可撤销任意游戏加分
-- 2) 关主只能撤销「自己操作」且「10 分钟内」的加分，用于现场误点纠正
-- 3) 撤销即扣回积分、删除游戏记录（员工可重新参与该项目）
-- 4) 写一条负数流水保留审计痕迹
-- 5) 若积分已被竞标冻结或已使用，撤销会被拦截
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
        NULL; -- 管理员不限
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

    -- 扣回后可用积分不能为负
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
