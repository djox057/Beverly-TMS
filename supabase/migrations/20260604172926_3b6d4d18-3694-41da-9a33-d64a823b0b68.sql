ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS scale_steer_axle numeric,
  ADD COLUMN IF NOT EXISTS scale_drive_axle numeric,
  ADD COLUMN IF NOT EXISTS scale_trailer_axle numeric,
  ADD COLUMN IF NOT EXISTS scale_gross numeric;