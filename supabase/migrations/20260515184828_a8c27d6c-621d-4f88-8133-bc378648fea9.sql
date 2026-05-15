CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS TABLE(active_orders bigint, available_trucks bigint, active_drivers bigint, total_brokers bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM orders),
    (SELECT count(*) FROM trucks WHERE is_active = true AND driver1_id IS NOT NULL),
    (SELECT count(DISTINCT d.id) FROM drivers d
       WHERE d.is_active = true
         AND EXISTS (
           SELECT 1 FROM trucks t
           WHERE t.is_active = true
             AND (t.driver1_id = d.id OR t.driver2_id = d.id)
         )),
    (SELECT count(*) FROM brokers);
$$;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO anon, authenticated, service_role;