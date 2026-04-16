ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bol_force_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pod_force_complete boolean NOT NULL DEFAULT false;