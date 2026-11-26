-- ============================================
-- 2026-11-26 管理员批量导入员工名单
-- 按工号去重：已存在只更新姓名/部门/角色，不影响积分与签到状态
-- ============================================
CREATE OR REPLACE FUNCTION public.import_employees(
    p_rows JSONB,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
    v_row JSONB;
    v_idx INTEGER := 0;
    v_no TEXT;
    v_name TEXT;
    v_dept TEXT;
    v_row_role TEXT;
    v_inserted INTEGER := 0;
    v_updated INTEGER := 0;
    v_exists BOOLEAN;
BEGIN
    SELECT e.role INTO v_role FROM public.employees e WHERE e.id = p_operator_id;
    IF COALESCE(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以导入员工名单';
    END IF;

    IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
        RAISE EXCEPTION '没有可导入的数据';
    END IF;
    IF jsonb_array_length(p_rows) > 2000 THEN
        RAISE EXCEPTION '单次最多导入 2000 人';
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        v_idx := v_idx + 1;
        v_no := upper(trim(COALESCE(v_row->>'employee_no', '')));
        v_name := trim(COALESCE(v_row->>'name', ''));
        v_dept := trim(COALESCE(v_row->>'department', ''));
        v_row_role := lower(trim(COALESCE(v_row->>'role', 'employee')));

        IF v_no = '' OR v_name = '' THEN
            RAISE EXCEPTION '第 % 行：工号或姓名为空', v_idx;
        END IF;
        IF v_row_role NOT IN ('admin', 'gamemaster', 'employee') THEN
            RAISE EXCEPTION '第 % 行：角色「%」无效', v_idx, v_row_role;
        END IF;

        SELECT EXISTS(SELECT 1 FROM public.employees e WHERE e.employee_no = v_no) INTO v_exists;

        INSERT INTO public.employees(employee_no, name, department, role)
        VALUES (v_no, v_name, v_dept, v_row_role)
        ON CONFLICT (employee_no) DO UPDATE
        SET name = EXCLUDED.name,
            department = EXCLUDED.department,
            role = EXCLUDED.role;

        IF v_exists THEN
            v_updated := v_updated + 1;
        ELSE
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    RETURN '导入完成：新增 ' || v_inserted || ' 人，更新 ' || v_updated || ' 人';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
