ALTER TABLE public.trucks
  DROP COLUMN IF EXISTS sale_price_week,
  DROP COLUMN IF EXISTS sale_terms;