CREATE OR REPLACE FUNCTION public.search_orders_v2(
  p_term text,
  p_booked_by text DEFAULT NULL,
  p_dispatcher_user_id uuid DEFAULT NULL,
  p_excluded_booked_by_company_id uuid DEFAULT NULL,
  p_booked_by_company_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS jsonb
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
  exact_matches AS (
    SELECT o.*
    FROM public.orders o
    WHERE (
        o.broker_load_number = p_term
        OR o.internal_load_number = p_term
        OR o.internal_load_number ILIKE p_term || '-%'
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
  ),
  substring_matches AS (
    SELECT o.*
    FROM public.orders o
    WHERE (SELECT count(*) FROM exact_matches) = 0
      AND length(p_term) >= 3
      AND p_term !~ '^\d+$'
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
  ),
  matched AS (
    SELECT * FROM exact_matches
    UNION ALL
    SELECT * FROM substring_matches
  )
  SELECT COALESCE(jsonb_agg(
    to_jsonb(m) ||
    jsonb_build_object(
      'pickup_drops',
        (SELECT COALESCE(jsonb_agg(to_jsonb(pd)), '[]'::jsonb)
         FROM public.pickup_drops pd WHERE pd.order_id = m.id),
      'order_files',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', f.id, 'file_category', f.file_category,
            'file_name', f.file_name, 'file_path', f.file_path,
            'order_id', f.order_id)), '[]'::jsonb)
         FROM public.order_files f WHERE f.order_id = m.id),
      'order_transfers',
        (SELECT COALESCE(jsonb_agg(
            to_jsonb(t) ||
            jsonb_build_object(
              'driver1', (SELECT to_jsonb(d) ||
                            jsonb_build_object('company',
                              (SELECT to_jsonb(c) FROM public.companies c WHERE c.id = d.company_id))
                          FROM public.drivers d WHERE d.id = t.driver1_id),
              'driver2', (SELECT to_jsonb(d) FROM public.drivers d WHERE d.id = t.driver2_id),
              'truck',   (SELECT to_jsonb(tk) ||
                            jsonb_build_object('company',
                              (SELECT to_jsonb(c) FROM public.companies c WHERE c.id = tk.company_id))
                          FROM public.trucks tk WHERE tk.id = t.truck_id),
              'trailer', (SELECT to_jsonb(tr) FROM public.trailers tr WHERE tr.id = t.trailer_id)
            )
          ), '[]'::jsonb)
         FROM public.order_transfers t WHERE t.order_id = m.id),
      'recovery_history',
        (SELECT COALESCE(jsonb_agg(
            to_jsonb(r) ||
            jsonb_build_object(
              'recovery_driver1', (SELECT to_jsonb(d) FROM public.drivers d WHERE d.id = r.recovery_driver1_id),
              'recovery_driver2', (SELECT to_jsonb(d) FROM public.drivers d WHERE d.id = r.recovery_driver2_id),
              'recovery_truck',   (SELECT to_jsonb(tk) FROM public.trucks tk WHERE tk.id = r.recovery_truck_id),
              'recovery_trailer', (SELECT to_jsonb(tr) FROM public.trailers tr WHERE tr.id = r.recovery_trailer_id)
            )
          ), '[]'::jsonb)
         FROM public.recovery_history r WHERE r.order_id = m.id),
      'broker',            (SELECT to_jsonb(b) FROM public.brokers b WHERE b.id = m.broker_id),
      'company',           (SELECT to_jsonb(c) FROM public.companies c WHERE c.id = m.company_id),
      'booked_by_company', (SELECT to_jsonb(c) FROM public.companies c WHERE c.id = m.booked_by_company_id),
      'truck', (SELECT to_jsonb(tk) ||
                  jsonb_build_object('company',
                    (SELECT to_jsonb(c) FROM public.companies c WHERE c.id = tk.company_id))
                FROM public.trucks tk WHERE tk.id = m.truck_id),
      'trailer',          (SELECT to_jsonb(tr) FROM public.trailers tr WHERE tr.id = m.trailer_id),
      'driver1', (SELECT to_jsonb(d) ||
                    jsonb_build_object('company',
                      (SELECT to_jsonb(c) FROM public.companies c WHERE c.id = d.company_id))
                  FROM public.drivers d WHERE d.id = m.driver1_id),
      'driver2',          (SELECT to_jsonb(d) FROM public.drivers d WHERE d.id = m.driver2_id),
      'original_driver1', (SELECT to_jsonb(d) FROM public.drivers d WHERE d.id = m.original_driver1_id),
      'original_driver2', (SELECT to_jsonb(d) FROM public.drivers d WHERE d.id = m.original_driver2_id),
      'original_truck',   (SELECT to_jsonb(tk) FROM public.trucks tk WHERE tk.id = m.original_truck_id),
      'original_trailer', (SELECT to_jsonb(tr) FROM public.trailers tr WHERE tr.id = m.original_trailer_id)
    )
  ), '[]'::jsonb)
  FROM matched m;
$function$;

GRANT EXECUTE ON FUNCTION public.search_orders_v2(text, text, uuid, uuid, uuid, int)
  TO authenticated, service_role;