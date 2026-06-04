ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS weight_rc numeric,
  ADD COLUMN IF NOT EXISTS weight_bol numeric;