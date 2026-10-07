-- Photos retain their actual inspection date; one photo submission on any day
-- of the Monday-Sunday Chicago week satisfies the existing photo requirement.
CREATE OR REPLACE FUNCTION public.pretrip_due_date()
RETURNS date LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT date_trunc('week', now() AT TIME ZONE 'America/Chicago')::date;
$$;

CREATE OR REPLACE FUNCTION public.get_pretrip_missing_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT count(*)::int FROM public.trucks t
 JOIN public.drivers d ON d.id = t.driver1_id
 WHERE auth.uid() IS NOT NULL AND t.is_active AND d.dispatcher_id = auth.uid()
 AND NOT EXISTS (
   SELECT 1 FROM public.pretrip_photos p WHERE p.truck_id = t.id
   AND p.inspection_date >= public.pretrip_due_date()
   AND p.inspection_date < public.pretrip_due_date() + 7
 );
$$;
REVOKE ALL ON FUNCTION public.get_pretrip_missing_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pretrip_missing_count() TO authenticated;

CREATE FUNCTION public.set_pretrip_week_checked(
 _truck_id uuid, _inspection_date date, _checked boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE week_start date;
BEGIN
 IF auth.uid() IS NULL OR NOT (
   public.has_role(auth.uid(), 'admin') OR
   public.has_role(auth.uid(), 'maintenance') OR
   public.has_role(auth.uid(), 'manager')
 ) THEN RAISE EXCEPTION 'not allowed'; END IF;
 IF _truck_id IS NULL OR _inspection_date IS NULL OR _checked IS NULL THEN
   RAISE EXCEPTION 'truck, inspection date and checked state are required';
 END IF;
 week_start := date_trunc('week', _inspection_date::timestamp)::date;
 PERFORM pg_advisory_xact_lock(hashtextextended(_truck_id::text || week_start::text, 0));
 IF _checked THEN
   INSERT INTO public.pretrip_checks (truck_id, inspection_date, checked_by, checked_at)
   VALUES (_truck_id, week_start, auth.uid(), now())
   ON CONFLICT (truck_id, inspection_date) DO UPDATE
     SET checked_by = EXCLUDED.checked_by, checked_at = EXCLUDED.checked_at;
 ELSE
   DELETE FROM public.pretrip_checks WHERE truck_id = _truck_id
     AND inspection_date >= week_start AND inspection_date < week_start + 7;
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_pretrip_week_checked(uuid,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_pretrip_week_checked(uuid,date,boolean) TO authenticated;
