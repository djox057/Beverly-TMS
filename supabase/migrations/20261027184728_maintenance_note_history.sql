CREATE TABLE public.truck_maintenance_note_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  old_note text,
  new_note text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX truck_maintenance_note_history_truck_time
  ON public.truck_maintenance_note_history(truck_id, changed_at DESC, id DESC);
ALTER TABLE public.truck_maintenance_note_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.truck_maintenance_note_history FROM anon, authenticated;
GRANT SELECT ON public.truck_maintenance_note_history TO authenticated;
GRANT ALL ON public.truck_maintenance_note_history TO service_role;
CREATE POLICY "Read recent maintenance notes for visible trucks"
  ON public.truck_maintenance_note_history FOR SELECT TO authenticated
  USING (changed_at >= now() - interval '14 days' AND EXISTS (
    SELECT 1 FROM public.trucks t WHERE t.id = truck_id
  ));

-- Preserve the current version only where its real timestamp is known.
INSERT INTO public.truck_maintenance_note_history(truck_id,new_note,changed_by_name,changed_at)
SELECT id,oil_change_note,oil_change_note_author,oil_change_note_updated_at
FROM public.trucks
WHERE nullif(btrim(oil_change_note),'') IS NOT NULL
  AND oil_change_note_updated_at >= now() - interval '14 days';

-- Writes are trigger-only, including dispatcher RPCs and direct authorized edits.
-- Definer privileges are restricted to inserting history, never changing trucks.
CREATE OR REPLACE FUNCTION private.log_truck_maintenance_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor_name text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT nullif(btrim(p.full_name),'') INTO actor_name
  FROM public.profiles p WHERE p.user_id = auth.uid();
  INSERT INTO public.truck_maintenance_note_history
    (truck_id,old_note,new_note,changed_by,changed_by_name,changed_at)
  VALUES (NEW.id,OLD.oil_change_note,NEW.oil_change_note,auth.uid(),
    coalesce(actor_name, CASE WHEN auth.uid() IS NULL THEN 'System' ELSE 'User' END), statement_timestamp());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.log_truck_maintenance_note() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER log_truck_maintenance_note
AFTER UPDATE OF oil_change_note ON public.trucks
FOR EACH ROW WHEN (OLD.oil_change_note IS DISTINCT FROM NEW.oil_change_note)
EXECUTE FUNCTION private.log_truck_maintenance_note();
