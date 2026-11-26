-- ============================================
-- 2026-11-26 活动公告管理
-- 管理员可新增、编辑、删除公告；写入通过 RPC 校验角色
-- ============================================
CREATE OR REPLACE FUNCTION public.save_announcement(
    p_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_sort INTEGER,
    p_active BOOLEAN,
    p_operator_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    IF COALESCE((SELECT e.role FROM public.employees e WHERE e.id = p_operator_id), '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以修改活动公告';
    END IF;
    IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
        RAISE EXCEPTION '公告标题不能为空';
    END IF;
    IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
        RAISE EXCEPTION '公告内容不能为空';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.announcements(title, content, sort_order, is_active)
        VALUES (trim(p_title), trim(p_content), COALESCE(p_sort, 0), COALESCE(p_active, true))
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.announcements
        SET title = trim(p_title),
            content = trim(p_content),
            sort_order = COALESCE(p_sort, 0),
            is_active = COALESCE(p_active, true)
        WHERE id = p_id
        RETURNING id INTO v_id;

        IF v_id IS NULL THEN
            RAISE EXCEPTION '公告不存在或已被删除';
        END IF;
    END IF;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.delete_announcement(
    p_id UUID,
    p_operator_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_title TEXT;
BEGIN
    IF COALESCE((SELECT e.role FROM public.employees e WHERE e.id = p_operator_id), '') <> 'admin' THEN
        RAISE EXCEPTION '只有管理员可以删除活动公告';
    END IF;

    DELETE FROM public.announcements WHERE id = p_id RETURNING title INTO v_title;

    IF v_title IS NULL THEN
        RAISE EXCEPTION '公告不存在或已被删除';
    END IF;

    RETURN '已删除公告「' || v_title || '」';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
