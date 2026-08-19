ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recovery_auto_cancel_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_cancel_payload jsonb,
  ADD COLUMN IF NOT EXISTS recovery_requested_by uuid,
  ADD COLUMN IF NOT EXISTS recovery_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_recovery_auto_cancel_at
  ON public.orders (recovery_auto_cancel_at)
  WHERE retrieval = true AND canceled = false;