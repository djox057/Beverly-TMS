-- Carrier accounts (one isolated EFS session per row)
CREATE TABLE public.efs_carrier_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  name text NOT NULL,
  credential_secret_name text NOT NULL,
  environment text NOT NULL DEFAULT 'qa',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_carrier_accounts_env_check CHECK (environment IN ('qa','production')),
  CONSTRAINT efs_carrier_accounts_name_key UNIQUE (name)
);

GRANT SELECT ON public.efs_carrier_accounts TO authenticated;
GRANT ALL ON public.efs_carrier_accounts TO service_role;
ALTER TABLE public.efs_carrier_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "efs_carrier_accounts_select" ON public.efs_carrier_accounts
FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','supervisor','accounting','safety','dispatch']::app_role[]));

-- Per-truck card status cache
CREATE TABLE public.efs_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_account_id uuid NOT NULL REFERENCES public.efs_carrier_accounts(id) ON DELETE CASCADE,
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  card_last_four text,
  raw_status text,
  controllable_status text,
  last_synced_at timestamptz,
  last_checked_at timestamptz,
  last_status_change_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_cards_controllable_check CHECK (controllable_status IS NULL OR controllable_status IN ('Active','Hold')),
  CONSTRAINT efs_cards_truck_key UNIQUE (truck_id)
);

CREATE INDEX idx_efs_cards_carrier ON public.efs_cards(carrier_account_id);

GRANT SELECT ON public.efs_cards TO authenticated;
GRANT ALL ON public.efs_cards TO service_role;
ALTER TABLE public.efs_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "efs_cards_select" ON public.efs_cards
FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','supervisor','accounting','safety','dispatch']::app_role[]));

-- Server-only secret card reference
CREATE TABLE public.efs_card_secrets (
  card_id uuid PRIMARY KEY REFERENCES public.efs_cards(id) ON DELETE CASCADE,
  card_number text NOT NULL,
  efs_card_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.efs_card_secrets TO service_role;
ALTER TABLE public.efs_card_secrets ENABLE ROW LEVEL SECURITY;

-- Background synchronization runs
CREATE TABLE public.efs_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_account_id uuid REFERENCES public.efs_carrier_accounts(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  cards_received integer NOT NULL DEFAULT 0,
  cards_changed integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_efs_sync_runs_started ON public.efs_sync_runs(started_at DESC);

GRANT SELECT ON public.efs_sync_runs TO authenticated;
GRANT ALL ON public.efs_sync_runs TO service_role;
ALTER TABLE public.efs_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "efs_sync_runs_select" ON public.efs_sync_runs
FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','supervisor','accounting','safety','dispatch']::app_role[]));

-- Audit of user-initiated status changes
CREATE TABLE public.efs_card_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  carrier_account_id uuid REFERENCES public.efs_carrier_accounts(id) ON DELETE SET NULL,
  card_last_four text,
  previous_raw_status text,
  requested_status text NOT NULL,
  confirmed_status text,
  user_id uuid,
  request_id text NOT NULL,
  result text NOT NULL,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_audit_requested_check CHECK (requested_status IN ('Active','Hold')),
  CONSTRAINT efs_audit_request_id_key UNIQUE (request_id)
);

CREATE INDEX idx_efs_audit_truck ON public.efs_card_status_audit(truck_id, created_at DESC);

GRANT SELECT ON public.efs_card_status_audit TO authenticated;
GRANT ALL ON public.efs_card_status_audit TO service_role;
ALTER TABLE public.efs_card_status_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "efs_card_status_audit_select" ON public.efs_card_status_audit
FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','supervisor','accounting','safety','dispatch']::app_role[]));

CREATE TRIGGER update_efs_carrier_accounts_updated_at BEFORE UPDATE ON public.efs_carrier_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_efs_cards_updated_at BEFORE UPDATE ON public.efs_cards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_efs_card_secrets_updated_at BEFORE UPDATE ON public.efs_card_secrets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();