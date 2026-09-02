CREATE OR REPLACE FUNCTION public.tmp_test_dispatch_assignment_rls(_uid uuid, _truck_id uuid, _trailer_id uuid, _driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  results jsonb := '[]'::jsonb;
  n int;
  msg text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. change truck driver1
  BEGIN
    UPDATE public.trucks SET driver1_id = _driver_id WHERE id = _truck_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'ROLLBACK_MARKER:%', n;
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
  END;
  results := results || jsonb_build_object('test', 'trucks.driver1_id update', 'outcome', msg);

  -- 2. change truck trailer
  BEGIN
    UPDATE public.trucks SET trailer_id = _trailer_id WHERE id = _truck_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'ROLLBACK_MARKER:%', n;
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
  END;
  results := results || jsonb_build_object('test', 'trucks.trailer_id update', 'outcome', msg);

  -- 3. clear truck driver2
  BEGIN
    UPDATE public.trucks SET driver2_id = NULL WHERE id = _truck_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'ROLLBACK_MARKER:%', n;
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
  END;
  results := results || jsonb_build_object('test', 'trucks.driver2_id clear', 'outcome', msg);

  -- 4. update trailers row
  BEGIN
    UPDATE public.trailers SET trailer_number = trailer_number WHERE id = _trailer_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'ROLLBACK_MARKER:%', n;
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
  END;
  results := results || jsonb_build_object('test', 'trailers update', 'outcome', msg);

  -- 5. manual assignment_history insert
  BEGIN
    INSERT INTO public.assignment_history (change_type, truck_id, trailer_id, driver1_id, changed_by, changed_at)
    VALUES ('trailer_assignment', _truck_id, _trailer_id, _driver_id, _uid, now());
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'ROLLBACK_MARKER:%', n;
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
  END;
  results := results || jsonb_build_object('test', 'assignment_history insert', 'outcome', msg);

  -- 6. drivers dispatcher_id change (restricted-field trigger)
  BEGIN
    UPDATE public.drivers SET dispatcher_id = _uid WHERE id = _driver_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'ROLLBACK_MARKER:%', n;
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
  END;
  results := results || jsonb_build_object('test', 'drivers.dispatcher_id update', 'outcome', msg);

  RESET ROLE;
  RETURN results;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tmp_test_dispatch_assignment_rls(uuid, uuid, uuid, uuid) TO service_role;