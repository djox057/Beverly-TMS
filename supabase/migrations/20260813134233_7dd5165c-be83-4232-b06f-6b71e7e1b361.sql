ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS samsara_insured boolean,
  ADD COLUMN IF NOT EXISTS samsara_account text,
  ADD COLUMN IF NOT EXISTS samsara_insured_updated_at timestamptz;