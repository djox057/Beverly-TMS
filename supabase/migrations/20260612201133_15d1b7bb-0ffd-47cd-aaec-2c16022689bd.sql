
CREATE OR REPLACE FUNCTION public.estimate_locked_orders_count(
  p_booked_by uuid DEFAULT NULL,
  p_driver_ids uuid[] DEFAULT NULL,
  p_excluded_booked_by_company_id uuid DEFAULT NULL,
  p_booked_by_company_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql text;
  v_plan jsonb;
  v_rows bigint;
  v_where text := 'locked = true';
BEGIN
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

  IF p_excluded_booked_by_company_id IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (booked_by_company_id <> %L OR booked_by_company_id IS NULL)',
      p_excluded_booked_by_company_id
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
$$;

GRANT EXECUTE ON FUNCTION public.estimate_locked_orders_count(uuid, uuid[], uuid, uuid) TO authenticated, service_role;
