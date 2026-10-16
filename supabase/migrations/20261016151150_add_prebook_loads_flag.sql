ALTER TABLE public.orders ADD COLUMN prebook boolean NOT NULL DEFAULT false;
CREATE INDEX orders_prebook_active_idx ON public.orders(created_at DESC) WHERE prebook=true AND canceled=false;
