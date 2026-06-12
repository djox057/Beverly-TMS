CREATE OR REPLACE FUNCTION public.search_orders_ids(
  p_term text,
  p_booked_by text DEFAULT NULL,
  p_dispatcher_user_id uuid DEFAULT NULL,
  p_excluded_booked_by_company_id uuid DEFAULT NULL,
  p_booked_by_company_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_all boolean;
  v_is_driver  boolean;
  v_is_yard    boolean;
  v_driver_id  uuid;
  v_result uuid[];
BEGIN
  IF length(coalesce(p_term,'')) < 3 THEN
    RETURN ARRAY[]::uuid[];
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
        p_excluded_booked_by_company_id IS NULL
        OR o.booked_by_company_id IS NULL
        OR o.booked_by_company_id <> p_excluded_booked_by_company_id
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
$$;

REVOKE ALL ON FUNCTION public.search_orders_ids(text,text,uuid,uuid,uuid,int) FROM public;
GRANT EXECUTE ON FUNCTION public.search_orders_ids(text,text,uuid,uuid,uuid,int) TO authenticated;