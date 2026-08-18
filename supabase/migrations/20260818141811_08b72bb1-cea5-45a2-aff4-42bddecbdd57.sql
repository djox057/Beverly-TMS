ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS retrieval boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_orders_retrieval ON public.orders (retrieval) WHERE retrieval = true;