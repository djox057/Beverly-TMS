CREATE OR REPLACE FUNCTION public.dispatcher_update_truck_oos(_truck_id uuid, _oos boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_any_role(ARRAY['dispatch','manager','admin','supervisor']::app_role[])) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.trucks SET oos = _oos WHERE id = _truck_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatcher_update_truck_oos(uuid, boolean) TO authenticated;