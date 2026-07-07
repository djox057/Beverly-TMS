ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS lumper_revised_rc_bypassed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lumper_revised_rc_bypassed_by uuid,
  ADD COLUMN IF NOT EXISTS lumper_revised_rc_bypassed_at timestamptz;

ALTER TABLE public.efs_other_requests
  ADD COLUMN IF NOT EXISTS receipt_bypassed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_bypassed_by uuid,
  ADD COLUMN IF NOT EXISTS receipt_bypassed_at timestamptz;