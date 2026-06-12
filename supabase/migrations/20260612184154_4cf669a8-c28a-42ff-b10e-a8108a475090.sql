
CREATE OR REPLACE FUNCTION public.search_orders_ids(
  p_term text,
  p_booked_by text DEFAULT NULL,
  p_dispatcher_user_id uuid DEFAULT NULL,
  p_excluded_booked_by_company_id uuid DEFAULT NULL,
  p_booked_by_company_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH
  dispatcher_drivers AS (
    SELECT id FROM public.drivers
    WHERE p_dispatcher_user_id IS NOT NULL
      AND dispatcher_id = p_dispatcher_user_id
  ),
  matches AS (
    SELECT o.id, o.created_at
    FROM public.orders o
    WHERE length(p_term) >= 3
      AND (
        o.broker_load_number ILIKE '%' || p_term || '%'
        OR o.internal_load_number ILIKE '%' || p_term || '%'
      )
      AND (
        p_dispatcher_user_id IS NULL
        OR (p_booked_by IS NOT NULL AND o.booked_by = p_booked_by)
        OR o.driver1_id IN (SELECT id FROM dispatcher_drivers)
      )
      AND (
        p_excluded_booked_by_company_id IS NULL
        OR o.booked_by_company_id IS NULL
        OR o.booked_by_company_id <> p_excluded_booked_by_company_id
      )
      AND (p_booked_by_company_id IS NULL OR o.booked_by_company_id = p_booked_by_company_id)
    ORDER BY o.created_at DESC
    LIMIT p_limit
  )
  SELECT COALESCE(array_agg(id ORDER BY created_at DESC), ARRAY[]::uuid[])
  FROM matches;
$function$;
