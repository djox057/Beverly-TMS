-- Log of every cron invocation (one row per fire)
CREATE TABLE public.afterhours_cron_log (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT NOT NULL,
  invocation_id UUID NOT NULL,
  chicago_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  success BOOLEAN,
  auth_method TEXT,
  expected_count INT,
  processed_count INT,
  error_message TEXT,
  payload JSONB
);

CREATE INDEX idx_afterhours_cron_log_function_date
  ON public.afterhours_cron_log(function_name, chicago_date DESC);

ALTER TABLE public.afterhours_cron_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read afterhours_cron_log"
  ON public.afterhours_cron_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','manager')
  ));

-- Per-SMS log with idempotency
CREATE TABLE public.afterhours_sms_send_log (
  id BIGSERIAL PRIMARY KEY,
  assignment_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  chicago_date DATE NOT NULL,
  invocation_id UUID NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rc_message_id TEXT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  UNIQUE (assignment_id, chicago_date)
);

CREATE INDEX idx_afterhours_sms_send_log_date
  ON public.afterhours_sms_send_log(chicago_date DESC);

ALTER TABLE public.afterhours_sms_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read afterhours_sms_send_log"
  ON public.afterhours_sms_send_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','manager')
  ));