-- Ensure orders table has full row data for realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;