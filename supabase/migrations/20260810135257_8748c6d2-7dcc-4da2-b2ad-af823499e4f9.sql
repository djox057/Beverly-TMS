-- 1. Extensions roster
CREATE TABLE public.ringcentral_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_extension_id text NOT NULL UNIQUE,
  extension_number text,
  rc_name text,
  rc_type text,
  phone_numbers text[] NOT NULL DEFAULT '{}',
  primary_phone_number text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  match_method text NOT NULL DEFAULT 'unmatched',
  timezone text NOT NULL DEFAULT 'America/Chicago',
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ringcentral_extensions TO authenticated;
GRANT ALL ON public.ringcentral_extensions TO service_role;
ALTER TABLE public.ringcentral_extensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view rc extensions"
ON public.ringcentral_extensions FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]));

CREATE INDEX idx_rc_extensions_user ON public.ringcentral_extensions(user_id);

-- 2. Daily aggregates
CREATE TABLE public.ringcentral_phone_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_extension_id text NOT NULL,
  ringcentral_phone_number text NOT NULL DEFAULT '',
  user_id uuid,
  metric_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  inbound_calls integer NOT NULL DEFAULT 0,
  outbound_calls integer NOT NULL DEFAULT 0,
  answered_calls integer NOT NULL DEFAULT 0,
  missed_calls integer NOT NULL DEFAULT 0,
  total_call_seconds integer NOT NULL DEFAULT 0,
  live_talk_seconds integer NOT NULL DEFAULT 0,
  average_answered_call_seconds integer NOT NULL DEFAULT 0,
  inbound_sms integer NOT NULL DEFAULT 0,
  outbound_sms integer NOT NULL DEFAULT 0,
  failed_sms integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rc_phone_metrics UNIQUE (rc_extension_id, ringcentral_phone_number, metric_date)
);
GRANT SELECT ON public.ringcentral_phone_metrics TO authenticated;
GRANT ALL ON public.ringcentral_phone_metrics TO service_role;
ALTER TABLE public.ringcentral_phone_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view rc metrics"
ON public.ringcentral_phone_metrics FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]));

CREATE INDEX idx_rc_metrics_date ON public.ringcentral_phone_metrics(metric_date DESC);
CREATE INDEX idx_rc_metrics_user_date ON public.ringcentral_phone_metrics(user_id, metric_date DESC);

-- 3. Per-call records (dedupe + traceability, no recordings)
CREATE TABLE public.ringcentral_call_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_record_id text NOT NULL UNIQUE,
  session_id text,
  rc_extension_id text,
  direction text,
  result text,
  action text,
  duration_seconds integer NOT NULL DEFAULT 0,
  live_talk_seconds integer NOT NULL DEFAULT 0,
  ring_seconds integer NOT NULL DEFAULT 0,
  hold_seconds integer NOT NULL DEFAULT 0,
  from_number text,
  to_number text,
  started_at timestamptz,
  metric_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ringcentral_call_records TO authenticated;
GRANT ALL ON public.ringcentral_call_records TO service_role;
ALTER TABLE public.ringcentral_call_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view rc call records"
ON public.ringcentral_call_records FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]));

CREATE INDEX idx_rc_calls_session ON public.ringcentral_call_records(session_id);
CREATE INDEX idx_rc_calls_ext_date ON public.ringcentral_call_records(rc_extension_id, metric_date DESC);
CREATE INDEX idx_rc_calls_from ON public.ringcentral_call_records(from_number);
CREATE INDEX idx_rc_calls_to ON public.ringcentral_call_records(to_number);

-- 4. Message metadata only (no bodies, no attachments)
CREATE TABLE public.ringcentral_message_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_message_id text NOT NULL UNIQUE,
  conversation_id text,
  rc_extension_id text,
  message_type text,
  direction text,
  message_status text,
  from_number text,
  to_numbers text[] NOT NULL DEFAULT '{}',
  creation_time timestamptz,
  metric_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ringcentral_message_records TO authenticated;
GRANT ALL ON public.ringcentral_message_records TO service_role;
ALTER TABLE public.ringcentral_message_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view rc message records"
ON public.ringcentral_message_records FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]));

CREATE INDEX idx_rc_msgs_ext_date ON public.ringcentral_message_records(rc_extension_id, metric_date DESC);
CREATE INDEX idx_rc_msgs_from ON public.ringcentral_message_records(from_number);

-- 5. Sync state
CREATE TABLE public.ringcentral_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL UNIQUE,
  last_successful_sync_at timestamptz,
  last_attempted_sync_at timestamptz,
  cursor_date date,
  cursor_page integer,
  status text NOT NULL DEFAULT 'idle',
  error_category text,
  error_message text,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ringcentral_sync_state TO authenticated;
GRANT ALL ON public.ringcentral_sync_state TO service_role;
ALTER TABLE public.ringcentral_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view rc sync state"
ON public.ringcentral_sync_state FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]));

-- updated_at triggers
CREATE TRIGGER trg_rc_extensions_updated_at BEFORE UPDATE ON public.ringcentral_extensions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rc_metrics_updated_at BEFORE UPDATE ON public.ringcentral_phone_metrics
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rc_sync_state_updated_at BEFORE UPDATE ON public.ringcentral_sync_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();