-- ============================================
-- 2026-11-26 定时保活（到 2027-02-01）
-- 使用 Supabase 内置 pg_cron，每天执行一次数据库写入，
-- 避免免费项目因长时间无活动被暂停。
-- 注意：需先启用 pg_cron 扩展（本脚本已包含 CREATE EXTENSION）。
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS public.keepalive_log (
    id BIGSERIAL PRIMARY KEY,
    pinged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.keepalive_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.keepalive_tick()
RETURNS VOID AS $$
DECLARE
    v_jobid BIGINT;
BEGIN
    -- 到 2027-02-01 自动停止
    IF now() >= TIMESTAMPTZ '2027-02-01 00:00:00+08' THEN
        SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'weiya-keepalive';
        IF v_jobid IS NOT NULL THEN
            PERFORM cron.unschedule(v_jobid);
        END IF;
        RETURN;
    END IF;

    INSERT INTO public.keepalive_log DEFAULT VALUES;

    -- 只保留最近 30 条
    DELETE FROM public.keepalive_log
    WHERE id <= (SELECT max(id) FROM public.keepalive_log) - 30;
END;
$$ LANGUAGE plpgsql;

-- 每天 03:00 UTC（北京时间 11:00）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'weiya-keepalive';
SELECT cron.schedule(
    'weiya-keepalive',
    '0 3 * * *',
    'SELECT public.keepalive_tick()'
);
