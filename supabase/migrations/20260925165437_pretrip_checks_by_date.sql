-- A checked inspection belongs to a truck and a Chicago inspection day.
CREATE TABLE public.pretrip_checks (
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  inspection_date date NOT NULL,
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (truck_id, inspection_date)
);

ALTER TABLE public.pretrip_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pretrip_checks FROM PUBLIC, anon;
GRANT SELECT ON public.pretrip_checks TO authenticated;
GRANT ALL ON public.pretrip_checks TO service_role;

CREATE POLICY "pretrip checks read" ON public.pretrip_checks
  FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::public.app_role[]));

-- Keep checkmarks that already exist on the trucks table on the current
-- inspection day; a truck-wide boolean cannot tell us which earlier day it meant.
INSERT INTO public.pretrip_checks (truck_id, inspection_date, checked_by, checked_at)
SELECT id, public.pretrip_due_date(), pretrip_checked_by, coalesce(pretrip_checked_at, now())
FROM public.trucks
WHERE pretrip_checked = true;

CREATE FUNCTION public.set_pretrip_checked(
  _truck_id uuid, _inspection_date date, _checked boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'maintenance') OR
    public.has_role(auth.uid(), 'manager')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _truck_id IS NULL OR _inspection_date IS NULL OR _checked IS NULL THEN
    RAISE EXCEPTION 'truck, inspection date and checked state are required';
  END IF;

  IF _checked THEN
    INSERT INTO public.pretrip_checks (truck_id, inspection_date, checked_by, checked_at)
    VALUES (_truck_id, _inspection_date, auth.uid(), now())
    ON CONFLICT (truck_id, inspection_date) DO UPDATE
      SET checked_by = EXCLUDED.checked_by, checked_at = EXCLUDED.checked_at;
  ELSE
    DELETE FROM public.pretrip_checks
    WHERE truck_id = _truck_id AND inspection_date = _inspection_date;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_pretrip_checked(uuid, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pretrip_checked(uuid, date, boolean) TO authenticated;
