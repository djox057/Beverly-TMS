
CREATE OR REPLACE FUNCTION public.get_orders_summary(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id              uuid    := NULLIF(p_filters->>'companyId','')::uuid;
  v_load_suffix             text    := NULLIF(p_filters->>'loadNumberSuffix','');
  v_booked_by               text    := NULLIF(p_filters->>'bookedBy','');
  v_truck_id                uuid    := NULLIF(p_filters->>'truckId','')::uuid;
  v_driver_id               uuid    := NULLIF(p_filters->>'driverId','')::uuid;
  v_broker_id               uuid    := NULLIF(p_filters->>'brokerId','')::uuid;
  v_locked_not_invoiced     boolean := COALESCE((p_filters->>'lockedNotInvoiced')::boolean, false);
  v_invoiced                boolean := COALESCE((p_filters->>'invoiced')::boolean, false);
  v_delivery_from           timestamptz := NULLIF(p_filters->>'deliveryDateFrom','')::timestamptz;
  v_delivery_to             timestamptz := NULLIF(p_filters->>'deliveryDateTo','')::timestamptz;
  v_pickup_from             timestamptz := NULLIF(p_filters->>'pickupDateFrom','')::timestamptz;
  v_pickup_to               timestamptz := NULLIF(p_filters->>'pickupDateTo','')::timestamptz;
  v_locked_arg              jsonb   := p_filters->'locked';
  v_locked_filter           boolean := CASE WHEN v_locked_arg IS NULL OR jsonb_typeof(v_locked_arg) = 'null'
                                            THEN NULL ELSE (v_locked_arg)::text::boolean END;
  v_exclude_booked_company  uuid    := NULLIF(p_filters->>'excludeBookedByCompanyId','')::uuid;
  v_suffix_clean            text;
  v_result                  jsonb;
BEGIN
  -- Caller must be authenticated; rely on RLS-style role gating in calling code.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_suffix_clean := CASE WHEN v_load_suffix IS NOT NULL
                         THEN upper(regexp_replace(v_load_suffix, '^-+', ''))
                         ELSE NULL END;

  SELECT jsonb_build_object(
    'totalCount',     count(*),
    'unlockedCount',  count(*) FILTER (WHERE locked = false),
    'lockedCount',    count(*) FILTER (WHERE locked = true),
    'invoicedCount',  count(*) FILTER (WHERE invoiced = true),
    'notInvoicedCount', count(*) FILTER (WHERE invoiced = false OR invoiced IS NULL),
    'freightSum',     COALESCE(sum(freight_amount), 0),
    'driverPaySum',   COALESCE(sum(driver_price), 0)
  )
  INTO v_result
  FROM orders o
  WHERE (v_company_id IS NULL OR o.booked_by_company_id = v_company_id)
    AND (v_suffix_clean IS NULL OR o.internal_load_number ILIKE '%-' || v_suffix_clean)
    AND (v_booked_by IS NULL OR o.booked_by = v_booked_by)
    AND (v_truck_id IS NULL OR o.truck_id = v_truck_id)
    AND (v_driver_id IS NULL OR o.driver1_id = v_driver_id OR o.driver2_id = v_driver_id)
    AND (v_broker_id IS NULL OR o.broker_id = v_broker_id)
    AND (NOT v_locked_not_invoiced OR (o.locked = true AND o.invoiced = false))
    AND (NOT v_invoiced OR o.invoiced = true)
    AND (v_delivery_from IS NULL OR o.delivery_datetime >= v_delivery_from)
    AND (v_delivery_to   IS NULL OR o.delivery_datetime <= v_delivery_to)
    AND (v_pickup_from   IS NULL OR o.pickup_datetime   >= v_pickup_from)
    AND (v_pickup_to     IS NULL OR o.pickup_datetime   <= v_pickup_to)
    AND (v_locked_filter IS NULL OR o.locked = v_locked_filter)
    AND (v_exclude_booked_company IS NULL
         OR o.booked_by_company_id IS NULL
         OR o.booked_by_company_id <> v_exclude_booked_company);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_summary(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_summary(jsonb) TO service_role;
