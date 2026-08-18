REVOKE EXECUTE ON FUNCTION public.refresh_driver_last_order(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_sync_last_order() FROM anon, authenticated;