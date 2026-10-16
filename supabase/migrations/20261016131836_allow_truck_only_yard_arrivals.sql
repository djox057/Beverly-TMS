ALTER TABLE public.driver_yard_actions ALTER COLUMN driver_id DROP NOT NULL;
ALTER TABLE public.driver_yard_actions ADD CONSTRAINT yard_arrival_has_driver_or_truck CHECK (driver_id IS NOT NULL OR nullif(btrim(truck_number),'') IS NOT NULL);

CREATE OR REPLACE FUNCTION public.add_truck_yard_arrival(p_truck_id uuid, p_arrival_datetime timestamptz, p_action_type text, p_comment text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE t public.trucks%ROWTYPE; arrival_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to add a yard arrival'; END IF;
 IF p_action_type NOT IN ('maintenance','return_truck','safety','recovery') OR p_action_type IS NULL THEN RAISE EXCEPTION 'Invalid arrival type'; END IF;
 IF p_arrival_datetime IS NULL THEN RAISE EXCEPTION 'Arrival date and time are required'; END IF;
 SELECT * INTO t FROM public.trucks WHERE id=p_truck_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Truck not found or unavailable'; END IF;
 INSERT INTO public.driver_yard_actions(driver_id,truck_number,arrival_datetime,action_type,comment,created_by,is_team)
 VALUES(t.driver1_id,t.truck_number,p_arrival_datetime,p_action_type,coalesce(p_comment,''),auth.uid(),t.driver1_id IS NOT NULL AND t.driver2_id IS NOT NULL)
 RETURNING id INTO arrival_id;
 IF t.driver1_id IS NOT NULL THEN
  UPDATE public.drivers SET going_yard=true WHERE id IN (t.driver1_id,t.driver2_id);
 END IF;
 RETURN arrival_id;
END $$;
REVOKE ALL ON FUNCTION public.add_truck_yard_arrival(uuid,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_truck_yard_arrival(uuid,timestamptz,text,text) TO authenticated;
