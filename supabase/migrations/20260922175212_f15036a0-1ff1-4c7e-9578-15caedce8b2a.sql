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

  -- Runs at 11:28 and 14:58 Chicago time; clears only at 11:30 and 15:00 (tolerance for cron drift)
  IF NOT ((v_hour = 11 AND v_min BETWEEN 28 AND 32) OR (v_hour = 14 AND v_min BETWEEN 58 AND 59) OR (v_hour = 15 AND v_min BETWEEN 0 AND 2)) THEN
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