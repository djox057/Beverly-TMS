CREATE OR REPLACE FUNCTION public.bulk_update_hos(updates jsonb)
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE drivers d SET
    hos_drive_minutes = (u->>'drive')::int,
    hos_shift_minutes = (u->>'shift')::int,
    hos_break_minutes = (u->>'break')::int,
    hos_cycle_minutes = (u->>'cycle')::int,
    hos_status = u->>'status',
    hos_last_updated = (u->>'updated')::timestamp
  FROM jsonb_array_elements(updates) AS u
  WHERE d.id = (u->>'id')::uuid;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;