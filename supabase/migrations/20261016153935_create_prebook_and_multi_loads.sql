-- Prebook already exists; reuse it rather than introducing a second flag.
CREATE OR REPLACE FUNCTION public.create_load_batch(order_data jsonb, load_entries jsonb, stops jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  entry jsonb; stop jsonb; payload jsonb; created jsonb;
  results jsonb := '[]'::jsonb;
  order_id uuid;
  is_prebook boolean := COALESCE((order_data->>'prebook')::boolean, false);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only managers and admins can create prebook or multiple loads' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(load_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(load_entries) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Provide between 1 and 50 loads';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(load_entries) e WHERE NULLIF(btrim(e->>'load_number'), '') IS NULL OR NULLIF(e->>'request_id', '') IS NULL)
    OR (SELECT count(DISTINCT regexp_replace(lower(e->>'load_number'), '[[:space:]#]', '', 'g')) FROM jsonb_array_elements(load_entries) e) <> jsonb_array_length(load_entries)
    OR (SELECT count(DISTINCT e->>'request_id') FROM jsonb_array_elements(load_entries) e) <> jsonb_array_length(load_entries) THEN
    RAISE EXCEPTION 'Each load needs a different load number and request ID';
  END IF;
  IF jsonb_typeof(stops) IS DISTINCT FROM 'array' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(stops) s WHERE s->>'type' = 'pickup')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(stops) s WHERE s->>'type' = 'delivery') THEN
    RAISE EXCEPTION 'Pickup and delivery stops are required';
  END IF;
  IF NOT is_prebook AND (NULLIF(order_data->>'truck_id', '') IS NULL OR NULLIF(order_data->>'driver1_id', '') IS NULL) THEN
    RAISE EXCEPTION 'Truck and primary driver are required for regular loads';
  END IF;
  -- Each existing create call takes the same company lock and allocates its own number.
  -- The entire batch (orders + stops) rolls back if any insert fails.
  FOR entry IN SELECT value FROM jsonb_array_elements(load_entries) LOOP
    payload := order_data || jsonb_build_object('load_number', btrim(entry->>'load_number'), 'broker_load_number', btrim(entry->>'load_number'), 'client_request_id', entry->>'request_id');
    IF is_prebook THEN
      payload := payload || jsonb_build_object('truck_id', null, 'trailer_id', null, 'driver1_id', null, 'driver2_id', null);
    END IF;
    created := public.create_order_with_unique_load_number(payload);
    order_id := (created->>'id')::uuid;
    UPDATE public.orders SET
      prebook = is_prebook,
      truck_id = NULLIF(payload->>'truck_id', '')::uuid,
      trailer_id = NULLIF(payload->>'trailer_id', '')::uuid,
      driver1_id = NULLIF(payload->>'driver1_id', '')::uuid,
      driver2_id = NULLIF(payload->>'driver2_id', '')::uuid,
      notes = NULLIF(payload->>'notes', ''),
      commodity = NULLIF(payload->>'commodity', ''),
      weight = NULLIF(payload->>'weight', '')::numeric,
      weight_rc = NULLIF(payload->>'weight', '')::numeric,
      reference_number = NULLIF(payload->>'reference_number', ''),
      po_number = NULLIF(payload->>'po_number', ''),
      pu_number = NULLIF(payload->>'pu_number', '')
    WHERE id = order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Load could not be updated'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pickup_drops p WHERE p.order_id = create_load_batch.order_id) THEN
      FOR stop IN SELECT value FROM jsonb_array_elements(stops) LOOP
        INSERT INTO public.pickup_drops (order_id, type, sequence_number, address, city, state, zip_code, company_name, datetime, end_datetime, latitude, longitude)
        VALUES (order_id, stop->>'type', (stop->>'sequence_number')::integer, stop->>'address', stop->>'city', stop->>'state', stop->>'zip_code', stop->>'company_name', (stop->>'datetime')::timestamptz, (stop->>'end_datetime')::timestamptz, (stop->>'latitude')::numeric, (stop->>'longitude')::numeric);
      END LOOP;
    END IF;
    results := results || jsonb_build_array(created || jsonb_build_object('request_id', entry->>'request_id', 'broker_load_number', entry->>'load_number'));
  END LOOP;
  RETURN results;
END;
$$;
REVOKE ALL ON FUNCTION public.create_load_batch(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_load_batch(jsonb, jsonb, jsonb) TO authenticated;
