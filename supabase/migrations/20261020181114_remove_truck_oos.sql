-- Deploy the app removal before applying: old Reports clients select oos explicitly.
UPDATE public.trucks SET oos = false
WHERE ltrim(truck_number, '0') IN ('364', '1289', '1306', '7328');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.trucks WHERE oos) THEN
    RAISE EXCEPTION 'Resolve remaining OOS flags before removing the column';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.dispatcher_update_truck_oos(uuid, boolean);
ALTER TABLE public.trucks DROP COLUMN oos;
