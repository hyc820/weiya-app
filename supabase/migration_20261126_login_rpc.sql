-- ============================================
-- 2026-11-26 登录合并为单次请求
-- 1) login_employee：工号查询 + 自动报到 + 实时排名，一次完成
-- 2) get_employee_profile：刷新员工信息 + 排名，一次完成
-- 目的：减少手机端登录/刷新时的网络往返次数
-- ============================================
CREATE OR REPLACE FUNCTION public.login_employee(p_employee_no TEXT)
RETURNS TABLE(
    id UUID,
    employee_no TEXT,
    name TEXT,
    department TEXT,
    role TEXT,
    current_points INTEGER,
    locked_points INTEGER,
    has_checked_in BOOLEAN,
    check_in_time TIMESTAMPTZ,
    rank_no INTEGER
) AS $$
DECLARE
    v_emp public.employees%ROWTYPE;
    v_rank INTEGER;
BEGIN
    SELECT * INTO v_emp
    FROM public.employees e
    WHERE e.employee_no = upper(trim(p_employee_no));

    IF NOT FOUND THEN
        RAISE EXCEPTION '工号不存在，请联系管理员';
    END IF;

    IF NOT v_emp.has_checked_in THEN
        UPDATE public.employees
        SET has_checked_in = true,
            check_in_time = now(),
            current_points = public.employees.current_points + 100
        WHERE public.employees.id = v_emp.id AND public.employees.has_checked_in = false;

        IF FOUND THEN
            INSERT INTO public.point_history(employee_id, points, point_type, reference, operator)
            VALUES (v_emp.id, 100, 'checkin', '报到', '系统');
        END IF;

        SELECT * INTO v_emp FROM public.employees e2 WHERE e2.id = v_emp.id;
    END IF;

    SELECT COUNT(*) + 1 INTO v_rank
    FROM public.employees e3
    WHERE e3.current_points > v_emp.current_points;

    RETURN QUERY
    SELECT v_emp.id, v_emp.employee_no, v_emp.name, v_emp.department, v_emp.role,
           v_emp.current_points, v_emp.locked_points, v_emp.has_checked_in, v_emp.check_in_time,
           v_rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_employee_profile(p_employee_id UUID)
RETURNS TABLE(
    id UUID,
    employee_no TEXT,
    name TEXT,
    department TEXT,
    role TEXT,
    current_points INTEGER,
    locked_points INTEGER,
    has_checked_in BOOLEAN,
    check_in_time TIMESTAMPTZ,
    rank_no INTEGER
) AS $$
DECLARE
    v_emp public.employees%ROWTYPE;
    v_rank INTEGER;
BEGIN
    SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '员工不存在';
    END IF;

    SELECT COUNT(*) + 1 INTO v_rank
    FROM public.employees e2
    WHERE e2.current_points > v_emp.current_points;

    RETURN QUERY
    SELECT v_emp.id, v_emp.employee_no, v_emp.name, v_emp.department, v_emp.role,
           v_emp.current_points, v_emp.locked_points, v_emp.has_checked_in, v_emp.check_in_time,
           v_rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
