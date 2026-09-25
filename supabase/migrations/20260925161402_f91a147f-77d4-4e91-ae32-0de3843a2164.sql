ALTER TABLE public.pretrip_photos ADD COLUMN IF NOT EXISTS inspection_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date;
UPDATE public.pretrip_photos SET inspection_date = (created_at AT TIME ZONE 'America/Chicago')::date;
CREATE INDEX IF NOT EXISTS pretrip_photos_date_idx ON public.pretrip_photos(inspection_date, truck_id);

CREATE OR REPLACE FUNCTION public.pretrip_due_date()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Chicago')::date AS d)
  SELECT CASE extract(isodow FROM d)::int
    WHEN 1 THEN d WHEN 2 THEN d-1 WHEN 3 THEN d-2 WHEN 4 THEN d-3
    WHEN 5 THEN d WHEN 6 THEN d-1 ELSE d-2 END FROM t
$$;

CREATE OR REPLACE FUNCTION public.get_pretrip_missing_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.trucks t
  JOIN public.drivers d ON d.id = t.driver1_id
  WHERE t.is_active AND d.dispatcher_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.pretrip_photos p
      WHERE p.truck_id = t.id AND p.inspection_date = public.pretrip_due_date())
$$;
REVOKE EXECUTE ON FUNCTION public.get_pretrip_missing_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pretrip_missing_count() TO authenticated;