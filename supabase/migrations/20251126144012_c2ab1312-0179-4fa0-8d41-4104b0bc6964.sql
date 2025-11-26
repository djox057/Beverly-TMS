-- Enable realtime for orders table
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Enable realtime for pickup_drops table
ALTER TABLE public.pickup_drops REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_drops;

-- Enable realtime for order_files table
ALTER TABLE public.order_files REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_files;