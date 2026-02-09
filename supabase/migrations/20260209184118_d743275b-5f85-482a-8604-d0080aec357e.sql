
CREATE OR REPLACE FUNCTION public.bulk_update_hos(updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  -- Update drivers with valid HOS data (drive >= 0)
  UPDATE drivers d SET
    hos_drive_minutes = (u->>'drive')::int,
    hos_shift_minutes = (u->>'shift')::int,
    hos_break_minutes = (u->>'break')::int,
    hos_cycle_minutes = (u->>'cycle')::int,
    hos_status = u->>'status',
    hos_last_updated = (u->>'updated')::timestamp
  FROM jsonb_array_elements(updates) AS u
  WHERE d.id = (u->>'id')::uuid
    AND (u->>'drive')::int >= 0;

  -- Update drivers with invalid HOS data (drive = -1): only update status + timestamp, keep timers
  UPDATE drivers d SET
    hos_status = u->>'status',
    hos_last_updated = (u->>'updated')::timestamp
  FROM jsonb_array_elements(updates) AS u
  WHERE d.id = (u->>'id')::uuid
    AND (u->>'drive')::int = -1;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
