-- Drop the FK constraint entirely so orders can keep the trailer_id reference
-- even after the trailer is deleted (we'll look it up from deleted_trailers)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_trailer_id_fkey;