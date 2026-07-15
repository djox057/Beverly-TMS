CREATE OR REPLACE FUNCTION public.dispatcher_update_truck_miles(_truck_id uuid, _miles integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _dispatcher_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Roles that can already update via RLS just use normal UPDATE; this function is for dispatch.
  IF NOT (has_role(_uid, 'dispatch'::app_role)
       OR has_any_role(ARRAY['afterhours','maintenance','admin','manager','accounting','safety','supervisor']::app_role[])) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  -- If caller is dispatch (and not one of the fully-privileged roles), require ownership of the truck's driver.
  IF has_role(_uid, 'dispatch'::app_role)
     AND NOT has_any_role(ARRAY['afterhours','maintenance','admin','manager','accounting','safety','supervisor']::app_role[]) THEN
    SELECT d.dispatcher_id INTO _dispatcher_id
    FROM trucks t
    LEFT JOIN drivers d ON d.id = t.driver1_id
    WHERE t.id = _truck_id;

    IF _dispatcher_id IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'Truck is not assigned to your driver';
    END IF;
  END IF;

  UPDATE public.trucks
  SET miles = _miles,
      miles_updated_at = now()
  WHERE id = _truck_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatcher_update_truck_miles(uuid, integer) TO authenticated;