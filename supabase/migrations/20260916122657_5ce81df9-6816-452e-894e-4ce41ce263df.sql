DROP FUNCTION IF EXISTS public.estimate_locked_orders_count(uuid, uuid[], uuid, uuid);
DROP FUNCTION IF EXISTS public.search_orders_ids(text, text, uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.search_orders_v2(text, text, uuid, uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.estimate_locked_orders_count(p_booked_by uuid DEFAULT NULL::uuid, p_driver_ids uuid[] DEFAULT NULL::uuid[], p_excluded_booked_by_company_id text DEFAULT NULL::text, p_booked_by_company_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sql text;
  v_plan jsonb;
  v_rows bigint;
  v_where text := 'locked = true';
  v_excluded uuid[];
BEGIN
  IF p_excluded_booked_by_company_id IS NOT NULL AND length(p_excluded_booked_by_company_id) > 0 THEN
    SELECT array_agg(x::uuid) INTO v_excluded
    FROM unnest(string_to_array(p_excluded_booked_by_company_id, ',')) AS x
    WHERE length(x) > 0;
  END IF;

  IF p_booked_by IS NOT NULL AND p_driver_ids IS NOT NULL AND array_length(p_driver_ids, 1) > 0 THEN
    v_where := v_where || format(
      ' AND (booked_by = %L OR driver1_id = ANY (%L::uuid[]))',
      p_booked_by, p_driver_ids
    );
  ELSIF p_booked_by IS NOT NULL THEN
    v_where := v_where || format(' AND booked_by = %L', p_booked_by);
  ELSIF p_driver_ids IS NOT NULL AND array_length(p_driver_ids, 1) > 0 THEN
    v_where := v_where || format(' AND driver1_id = ANY (%L::uuid[])', p_driver_ids);
  END IF;

  IF v_excluded IS NOT NULL AND array_length(v_excluded, 1) > 0 THEN
    v_where := v_where || format(
      ' AND (booked_by_company_id IS NULL OR booked_by_company_id <> ALL (%L::uuid[]))',
      v_excluded
    );
  END IF;

  IF p_booked_by_company_id IS NOT NULL THEN
    v_where := v_where || format(' AND booked_by_company_id = %L', p_booked_by_company_id);
  END IF;

  v_sql := 'EXPLAIN (FORMAT JSON) SELECT 1 FROM public.orders WHERE ' || v_where;

  EXECUTE v_sql INTO v_plan;

  v_rows := COALESCE((v_plan -> 0 -> 'Plan' ->> 'Plan Rows')::bigint, 0);
  RETURN v_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_orders_ids(p_term text, p_booked_by text DEFAULT NULL::text, p_dispatcher_user_id uuid DEFAULT NULL::uuid, p_excluded_booked_by_company_id text DEFAULT NULL::text, p_booked_by_company_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_all boolean;
  v_is_driver  boolean;
  v_is_yard    boolean;
  v_driver_id  uuid;
  v_result uuid[];
  v_excluded uuid[];
BEGIN
  IF length(coalesce(p_term,'')) < 3 THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  IF p_excluded_booked_by_company_id IS NOT NULL AND length(p_excluded_booked_by_company_id) > 0 THEN
    SELECT array_agg(x::uuid) INTO v_excluded
    FROM unnest(string_to_array(p_excluded_booked_by_company_id, ',')) AS x
    WHERE length(x) > 0;
  END IF;

  v_can_view_all := public.has_any_role(
    ARRAY['dispatch','afterhours','manager','admin','accounting',
          'supervisor','safety','maintenance','chicago_management']::app_role[]
  );
  v_is_driver := public.has_role(v_uid, 'driver'::app_role);
  v_is_yard   := public.has_role(v_uid, 'yard'::app_role);

  IF NOT (v_can_view_all OR v_is_driver OR v_is_yard) THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  IF v_is_driver AND NOT v_can_view_all THEN
    v_driver_id := public.get_driver_id_for_user();
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY created_at DESC), ARRAY[]::uuid[])
  INTO v_result
  FROM (
    SELECT o.id, o.created_at
    FROM public.orders o
    WHERE (
        o.broker_load_number  ILIKE '%' || p_term || '%'
        OR o.internal_load_number ILIKE '%' || p_term || '%'
      )
      AND (
        p_dispatcher_user_id IS NULL
        OR (p_booked_by IS NOT NULL AND o.booked_by = p_booked_by)
        OR o.driver1_id IN (
          SELECT id FROM public.drivers WHERE dispatcher_id = p_dispatcher_user_id
        )
      )
      AND (
        v_excluded IS NULL
        OR o.booked_by_company_id IS NULL
        OR o.booked_by_company_id <> ALL (v_excluded)
      )
      AND (p_booked_by_company_id IS NULL OR o.booked_by_company_id = p_booked_by_company_id)
      AND (
        v_can_view_all
        OR (v_is_driver AND (o.driver1_id = v_driver_id OR o.driver2_id = v_driver_id))
        OR (v_is_yard AND o.driver1_id IS NULL AND o.truck_id IS NULL)
      )
    ORDER BY o.created_at DESC
    LIMIT p_limit
  ) m;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_orders_v2(p_term text, p_booked_by text DEFAULT NULL::text, p_dispatcher_user_id uuid DEFAULT NULL::uuid, p_excluded_booked_by_company_id text DEFAULT NULL::text, p_booked_by_company_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH
  excluded_ids AS (
    SELECT array_agg(x::uuid) AS ids
    FROM unnest(string_to_array(coalesce(nullif(p_excluded_booked_by_company_id, ''), ''), ',')) AS x
    WHERE length(x) > 0
  ),
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
        o.booked_by_company_id IS NULL
        OR o.booked_by_company_id NOT IN (SELECT unnest(ids) FROM excluded_ids)
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
        o.booked_by_company_id IS NULL
        OR o.booked_by_company_id NOT IN (SELECT unnest(ids) FROM excluded_ids)
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

GRANT EXECUTE ON FUNCTION public.estimate_locked_orders_count(uuid, uuid[], text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estimate_locked_orders_count(uuid, uuid[], text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_orders_ids(text, text, uuid, text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_orders_ids(text, text, uuid, text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_orders_v2(text, text, uuid, text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_orders_v2(text, text, uuid, text, uuid, integer) TO service_role;