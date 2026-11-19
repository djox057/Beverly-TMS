-- The caller's stop write has already passed pickup_drops RLS. Maintain only
-- its derived order dates, including for roles with narrower order write access.
CREATE FUNCTION private.sync_order_stop_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_parent uuid;
  new_parent uuid;
  old_kind text;
  new_kind text;
  parent uuid;
  appointment timestamptz;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_parent := OLD.order_id; old_kind := OLD.type; END IF;
  IF TG_OP <> 'DELETE' THEN new_parent := NEW.order_id; new_kind := NEW.type; END IF;

  -- Serialize writers on the same order before taking a fresh aggregate snapshot.
  -- The stable lock order also handles a stop moving between orders.
  FOR parent IN
    SELECT id FROM public.orders WHERE id IN (old_parent, new_parent)
    ORDER BY id FOR NO KEY UPDATE
  LOOP
    IF (old_parent = parent AND old_kind = 'pickup') OR (new_parent = parent AND new_kind = 'pickup') THEN
      SELECT min(datetime) INTO appointment FROM public.pickup_drops
      WHERE order_id = parent AND type = 'pickup';
      UPDATE public.orders SET pickup_datetime = appointment
      WHERE id = parent AND pickup_datetime IS DISTINCT FROM appointment;
    END IF;
    IF (old_parent = parent AND old_kind IN ('delivery','drop')) OR
       (new_parent = parent AND new_kind IN ('delivery','drop')) THEN
      SELECT max(datetime) INTO appointment FROM public.pickup_drops
      WHERE order_id = parent AND type IN ('delivery','drop');
      UPDATE public.orders SET delivery_datetime = appointment
      WHERE id = parent AND delivery_datetime IS DISTINCT FROM appointment;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION private.sync_order_stop_schedule() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER sync_order_stop_schedule
AFTER INSERT OR DELETE OR UPDATE OF order_id, type, datetime ON public.pickup_drops
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.sync_order_stop_schedule();

-- Edit Order preserves stop IDs by position, including their checkout and arrival
-- timestamps. Commit its entire list together so deferred triggers see the final dates.
CREATE FUNCTION public.save_order_stop_list(p_order_id uuid, p_stops jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  existing_ids uuid[];
  stop public.pickup_drops;
  position integer := 0;
BEGIN
  IF jsonb_typeof(p_stops) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expected an array of stops';
  END IF;
  PERFORM id FROM public.orders WHERE id = p_order_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order unavailable'; END IF;
  SELECT array_agg(id ORDER BY sequence_number, id) INTO existing_ids
  FROM public.pickup_drops WHERE order_id = p_order_id;

  -- Move existing positions out of the way before assigning the new sequence.
  UPDATE public.pickup_drops s SET sequence_number = -(idx + 1000)
  FROM unnest(existing_ids) WITH ORDINALITY AS listed(id, idx)
  WHERE s.id = listed.id AND s.order_id = p_order_id;

  FOR stop IN SELECT * FROM jsonb_populate_recordset(NULL::public.pickup_drops, p_stops) LOOP
    position := position + 1;
    IF existing_ids[position] IS NOT NULL THEN
      UPDATE public.pickup_drops SET
        (sequence_number, type, address, city, state, zip_code, company_name, datetime, end_datetime,
         contact_name, contact_phone, special_instructions, latitude, longitude) =
        (position, stop.type, stop.address, stop.city, stop.state, stop.zip_code, stop.company_name,
         stop.datetime, stop.end_datetime, stop.contact_name, stop.contact_phone, stop.special_instructions,
         stop.latitude, stop.longitude)
      WHERE id = existing_ids[position] AND order_id = p_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Stop unavailable'; END IF;
    ELSE
      INSERT INTO public.pickup_drops
        (order_id, sequence_number, type, address, city, state, zip_code, company_name, datetime, end_datetime,
         contact_name, contact_phone, special_instructions, latitude, longitude)
      VALUES (p_order_id, position, stop.type, stop.address, stop.city, stop.state, stop.zip_code,
              stop.company_name, stop.datetime, stop.end_datetime, stop.contact_name, stop.contact_phone,
              stop.special_instructions, stop.latitude, stop.longitude);
    END IF;
  END LOOP;
  IF position < cardinality(existing_ids) THEN
    DELETE FROM public.pickup_drops WHERE order_id = p_order_id AND id = ANY(existing_ids[position+1:]);
    IF EXISTS (SELECT 1 FROM public.pickup_drops WHERE order_id = p_order_id AND id = ANY(existing_ids[position+1:])) THEN
      RAISE EXCEPTION 'Unable to remove unused stops';
    END IF;
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.save_order_stop_list(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_order_stop_list(uuid, jsonb) TO authenticated;
