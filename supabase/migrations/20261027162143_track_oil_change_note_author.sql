-- Additive metadata; old notes remain unchanged with unknown attribution.
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS oil_change_note_author text,
  ADD COLUMN IF NOT EXISTS oil_change_note_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_truck_oil_change_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.oil_change_note IS DISTINCT FROM OLD.oil_change_note THEN
    IF nullif(btrim(NEW.oil_change_note), '') IS NULL THEN
      NEW.oil_change_note_author := NULL;
      NEW.oil_change_note_updated_at := NULL;
    ELSE
      SELECT nullif(btrim(p.full_name), '') INTO NEW.oil_change_note_author
      FROM public.profiles p WHERE p.user_id = auth.uid();
      NEW.oil_change_note_author := coalesce(NEW.oil_change_note_author,
        CASE WHEN auth.uid() IS NULL THEN 'System' ELSE 'User' END);
      NEW.oil_change_note_updated_at := statement_timestamp();
    END IF;
  ELSE
    -- Telemetry updates and caller-supplied metadata cannot alter attribution.
    NEW.oil_change_note_author := OLD.oil_change_note_author;
    NEW.oil_change_note_updated_at := OLD.oil_change_note_updated_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_truck_oil_change_note() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER stamp_truck_oil_change_note
BEFORE UPDATE OF oil_change_note, oil_change_note_author, oil_change_note_updated_at ON public.trucks
FOR EACH ROW EXECUTE FUNCTION public.stamp_truck_oil_change_note();
