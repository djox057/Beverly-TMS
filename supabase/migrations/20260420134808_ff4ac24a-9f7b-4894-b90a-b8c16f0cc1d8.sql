-- ============================================================
-- afterhours_cron_log: audit trail for cron / manual invocations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.afterhours_cron_log (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT NOT NULL,
  invocation_id TEXT NOT NULL,
  chicago_date DATE NOT NULL,
  auth_method TEXT,
  expected_count INTEGER,
  processed_count INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  success BOOLEAN,
  error_message TEXT,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_afterhours_cron_log_date
  ON public.afterhours_cron_log (chicago_date DESC, function_name);

CREATE INDEX IF NOT EXISTS idx_afterhours_cron_log_invocation
  ON public.afterhours_cron_log (invocation_id);

ALTER TABLE public.afterhours_cron_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view cron log"
  ON public.afterhours_cron_log
  FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role]));

-- ============================================================
-- afterhours_sms_send_log: per-SMS attempt log + idempotency
-- ============================================================
CREATE TABLE IF NOT EXISTS public.afterhours_sms_send_log (
  id BIGSERIAL PRIMARY KEY,
  assignment_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  chicago_date DATE NOT NULL,
  invocation_id TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  rc_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: only ONE successful send per (assignment, day).
-- Failures may be retried, so we use a partial unique index for success=true only.
CREATE UNIQUE INDEX IF NOT EXISTS idx_afterhours_sms_send_log_unique_success
  ON public.afterhours_sms_send_log (assignment_id, chicago_date)
  WHERE success = true;

CREATE INDEX IF NOT EXISTS idx_afterhours_sms_send_log_lookup
  ON public.afterhours_sms_send_log (chicago_date DESC, assignment_id);

CREATE INDEX IF NOT EXISTS idx_afterhours_sms_send_log_driver
  ON public.afterhours_sms_send_log (driver_id, chicago_date DESC);

ALTER TABLE public.afterhours_sms_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view sms send log"
  ON public.afterhours_sms_send_log
  FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role]));