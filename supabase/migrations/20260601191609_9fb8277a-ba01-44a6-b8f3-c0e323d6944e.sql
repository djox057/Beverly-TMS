ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS transmission text,
  ADD COLUMN IF NOT EXISTS year integer,
  ADD COLUMN IF NOT EXISTS miles integer,
  ADD COLUMN IF NOT EXISTS engine text,
  ADD COLUMN IF NOT EXISTS has_apu_webasto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_inverter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_fridge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sale_price_week numeric(10,2),
  ADD COLUMN IF NOT EXISTS sale_terms text;