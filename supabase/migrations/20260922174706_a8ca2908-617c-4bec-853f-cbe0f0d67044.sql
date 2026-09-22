CREATE OR REPLACE FUNCTION public.clear_truck_notes_scheduled()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour int;
  v_min int;
  v_count int := 0;
BEGIN
  v_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Chicago'))::int;
  v_min := EXTRACT(MINUTE FROM (now() AT TIME ZONE 'America/Chicago'))::int;

  -- Only run at 11:30 and 15:00 Chicago time (small tolerance for cron drift)
  IF NOT ((v_hour = 11 AND v_min BETWEEN 28 AND 34) OR (v_hour = 15 AND v_min BETWEEN 0 AND 6)) THEN
    RETURN 0;
  END IF;

  UPDATE public.truck_notes tn
  SET note = '', updated_by = NULL
  WHERE COALESCE(TRIM(tn.note), '') <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.drivers d
      JOIN public.profiles p ON p.user_id = d.dispatcher_id
      WHERE d.id = tn.driver_id
        AND p.office = 'Recovery'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_truck_notes_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_truck_notes_scheduled() TO service_role;