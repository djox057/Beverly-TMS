ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS pretrip_checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pretrip_checked_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_truck_pretrip_checked(_truck_id uuid, _checked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'maintenance') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE public.trucks
  SET pretrip_checked = _checked,
      pretrip_checked_by = CASE WHEN _checked THEN auth.uid() ELSE NULL END,
      pretrip_checked_at = CASE WHEN _checked THEN now() ELSE NULL END
  WHERE id = _truck_id;
END;
$$;