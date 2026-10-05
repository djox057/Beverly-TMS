CREATE TABLE public.mandatory_yard_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  service_type text NOT NULL DEFAULT 'mandatory_yard_repair' CHECK (service_type IN ('mandatory_yard_repair','dot','oil_change')),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  due_date date NOT NULL,
  reported_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date,
  reported_by uuid NOT NULL DEFAULT auth.uid(),
  reported_by_name text NOT NULL DEFAULT '',
  dispatch_informed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  status_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mandatory_yard_repairs_open_truck_idx ON public.mandatory_yard_repairs(truck_id, due_date) WHERE status IN ('pending','in_progress');
CREATE INDEX mandatory_yard_repairs_driver_idx ON public.mandatory_yard_repairs(driver_id);
ALTER TABLE public.mandatory_yard_repairs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.mandatory_yard_repairs TO authenticated;
CREATE POLICY "Operational roles view yard repair tasks" ON public.mandatory_yard_repairs FOR SELECT TO authenticated
USING ((SELECT public.has_any_role(ARRAY['admin','manager','maintenance','safety','yard','dispatch','supervisor','afterhours','chicago_management','accounting','claims']::public.app_role[])));
CREATE POLICY "Maintenance creates yard repair tasks" ON public.mandatory_yard_repairs FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_any_role(ARRAY['admin','manager','maintenance']::public.app_role[])) AND reported_by = (SELECT auth.uid()));
CREATE POLICY "Maintenance updates yard repair tasks" ON public.mandatory_yard_repairs FOR UPDATE TO authenticated
USING ((SELECT public.has_any_role(ARRAY['admin','manager','maintenance']::public.app_role[])))
WITH CHECK ((SELECT public.has_any_role(ARRAY['admin','manager','maintenance']::public.app_role[])));

-- Invoker trigger: reporter/date are trusted server values and immutable on edit.
CREATE FUNCTION public.stamp_mandatory_yard_repair() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.reported_by := auth.uid();
    NEW.reported_by_name := COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1), 'Unknown');
    NEW.reported_date := (now() AT TIME ZONE 'America/Chicago')::date;
    NEW.created_at := now();
  ELSE
    NEW.reported_by := OLD.reported_by;
    NEW.reported_by_name := OLD.reported_by_name;
    NEW.reported_date := OLD.reported_date;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_mandatory_yard_repair() FROM PUBLIC;
CREATE TRIGGER stamp_mandatory_yard_repair BEFORE INSERT OR UPDATE ON public.mandatory_yard_repairs FOR EACH ROW EXECUTE FUNCTION public.stamp_mandatory_yard_repair();
ALTER PUBLICATION supabase_realtime ADD TABLE public.mandatory_yard_repairs;
