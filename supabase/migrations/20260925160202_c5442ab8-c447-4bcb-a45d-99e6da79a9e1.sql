CREATE OR REPLACE FUNCTION public.dispatcher_update_truck_pretrip(_truck_id uuid, _pretrip_date date, _pretrip_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.trucks t
    JOIN public.drivers d ON d.id = t.driver1_id
    WHERE t.id = _truck_id AND d.dispatcher_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this truck';
  END IF;
  UPDATE public.trucks
  SET pretrip_date = _pretrip_date, pretrip_note = _pretrip_note
  WHERE id = _truck_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dispatcher_update_truck_pretrip(uuid, date, text) TO authenticated;