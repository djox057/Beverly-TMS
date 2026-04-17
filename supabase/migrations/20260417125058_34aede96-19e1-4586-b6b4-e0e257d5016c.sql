ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS other_charges_items JSONB,
  ADD COLUMN IF NOT EXISTS other_additionals_items JSONB;