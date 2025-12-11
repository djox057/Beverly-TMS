-- Re-add FK constraint with ON DELETE SET NULL so joins work
-- When trailer is deleted, orders.trailer_id becomes NULL (but we save to deleted_trailers first)
ALTER TABLE public.orders 
ADD CONSTRAINT orders_trailer_id_fkey 
FOREIGN KEY (trailer_id) 
REFERENCES public.trailers(id) 
ON DELETE SET NULL;