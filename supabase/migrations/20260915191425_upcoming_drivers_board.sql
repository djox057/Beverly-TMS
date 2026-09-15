SET lock_timeout = '5s';

CREATE SCHEMA upcoming_drivers_private;
REVOKE ALL ON SCHEMA upcoming_drivers_private FROM PUBLIC;
GRANT USAGE ON SCHEMA upcoming_drivers_private TO authenticated;

-- Match useAuth.getPrimaryRole exactly; do not use inherited hasRole permissions.
CREATE FUNCTION upcoming_drivers_private.primary_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role::text
    WHEN 'admin' THEN 1 WHEN 'safety' THEN 2 WHEN 'claims' THEN 3
    WHEN 'accounting' THEN 4 WHEN 'manager' THEN 5 WHEN 'supervisor' THEN 6
    WHEN 'chicago_management' THEN 7 WHEN 'maintenance' THEN 8
    WHEN 'dispatch' THEN 9 WHEN 'afterhours' THEN 10 WHEN 'yard' THEN 11
    WHEN 'driver' THEN 12 ELSE 13 END LIMIT 1;
$$;
REVOKE ALL ON FUNCTION upcoming_drivers_private.primary_role() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION upcoming_drivers_private.primary_role() TO authenticated;

CREATE TABLE public.upcoming_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_name text NOT NULL CHECK (length(btrim(driver_name)) BETWEEN 1 AND 150),
  phone text NOT NULL CHECK (length(phone) <= 40 AND length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 7 AND 15),
  safety_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dispatcher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sales text NOT NULL DEFAULT '' CHECK (length(sales) <= 500),
  timing_note text NOT NULL DEFAULT '' CHECK (length(timing_note) <= 500),
  application_status text NOT NULL DEFAULT '' CHECK (length(application_status) <= 100),
  transport_note text NOT NULL DEFAULT '' CHECK (length(transport_note) <= 20000),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  mvr text NOT NULL DEFAULT '' CHECK (length(mvr) <= 20000),
  psp text NOT NULL DEFAULT '' CHECK (length(psp) <= 20000),
  preference text NOT NULL DEFAULT '' CHECK (length(preference) <= 2000),
  truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  truck_terms text NOT NULL DEFAULT '' CHECK (length(truck_terms) <= 2000),
  drug_test_company text NOT NULL DEFAULT '' CHECK (length(drug_test_company) <= 200),
  clearinghouse_status text NOT NULL DEFAULT '' CHECK (length(clearinghouse_status) <= 100),
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Contacted','Scheduled','Arrived','Canceled')),
  ticket_note text NOT NULL DEFAULT '' CHECK (length(ticket_note) <= 20000),
  -- Local Chicago calendar values. Never store these as timestamptz or convert input.
  arrival_date date CHECK (arrival_date BETWEEN '2000-01-01' AND '2100-12-31'),
  arrival_time time without time zone,
  tentative boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  transport_preview text GENERATED ALWAYS AS (left(transport_note, 100)) STORED,
  description_preview text GENERATED ALWAYS AS (left(description, 100)) STORED,
  mvr_preview text GENERATED ALWAYS AS (left(mvr, 100)) STORED,
  psp_preview text GENERATED ALWAYS AS (left(psp, 100)) STORED,
  ticket_preview text GENERATED ALWAYS AS (left(ticket_note, 100)) STORED,
  CONSTRAINT upcoming_time_needs_date CHECK (arrival_time IS NULL OR arrival_date IS NOT NULL)
);
CREATE INDEX upcoming_drivers_week_idx ON public.upcoming_drivers (archived, arrival_date, id);
CREATE INDEX upcoming_drivers_phone_idx ON public.upcoming_drivers ((regexp_replace(phone, '[^0-9]', '', 'g')));
ALTER TABLE public.upcoming_drivers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upcoming_drivers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.upcoming_drivers TO authenticated;
GRANT INSERT (id,recruiter_id,driver_name,phone,safety_id,dispatcher_id,sales,timing_note,
 application_status,transport_note,description,mvr,psp,preference,truck_id,truck_terms,
 drug_test_company,clearinghouse_status,status,ticket_note,arrival_date,arrival_time,tentative)
 ON public.upcoming_drivers TO authenticated;
GRANT UPDATE (recruiter_id,driver_name,phone,safety_id,dispatcher_id,sales,timing_note,
 application_status,transport_note,description,mvr,psp,preference,truck_id,truck_terms,
 drug_test_company,clearinghouse_status,status,ticket_note,arrival_date,arrival_time,tentative,archived)
 ON public.upcoming_drivers TO authenticated;
CREATE POLICY upcoming_drivers_read ON public.upcoming_drivers FOR SELECT TO authenticated
 USING ((SELECT upcoming_drivers_private.primary_role()) IN ('admin','manager','supervisor','safety','recruiting','chicago_management','dispatch'));
CREATE POLICY upcoming_drivers_insert ON public.upcoming_drivers FOR INSERT TO authenticated
 WITH CHECK ((SELECT upcoming_drivers_private.primary_role()) IN ('admin','manager','supervisor','safety','recruiting','dispatch'));
CREATE POLICY upcoming_drivers_update ON public.upcoming_drivers FOR UPDATE TO authenticated
 USING ((SELECT upcoming_drivers_private.primary_role()) IN ('admin','manager','supervisor','safety','recruiting','dispatch'))
 WITH CHECK ((SELECT upcoming_drivers_private.primary_role()) IN ('admin','manager','supervisor','safety','recruiting','dispatch'));

CREATE TABLE public.upcoming_driver_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upcoming_driver_id uuid NOT NULL REFERENCES public.upcoming_drivers(id),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  changed_at timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago'),
  operation text NOT NULL,
  changes jsonb NOT NULL
);
CREATE INDEX upcoming_driver_history_record_idx ON public.upcoming_driver_history (upcoming_driver_id, changed_at DESC);
ALTER TABLE public.upcoming_driver_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upcoming_driver_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.upcoming_driver_history TO authenticated;
CREATE POLICY upcoming_driver_history_read ON public.upcoming_driver_history FOR SELECT TO authenticated
 USING ((SELECT upcoming_drivers_private.primary_role()) IN ('admin','manager','supervisor','safety','recruiting','chicago_management','dispatch'));

CREATE FUNCTION upcoming_drivers_private.validate_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE role_name text := upcoming_drivers_private.primary_role();
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('admin','manager','supervisor','safety','recruiting','dispatch') THEN
    RAISE EXCEPTION 'Upcoming Drivers editing is not permitted' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.archived IS DISTINCT FROM OLD.archived AND role_name NOT IN ('admin','manager','supervisor') THEN
      RAISE EXCEPTION 'Only admin, manager and supervisor may archive or restore entries' USING ERRCODE='42501';
    END IF;
    NEW.id := OLD.id; NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
    NEW.version := OLD.version + 1;
  ELSE
    NEW.created_by := auth.uid(); NEW.created_at := now(); NEW.version := 1; NEW.archived := false;
  END IF;
  IF NEW.recruiter_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.recruiter_id IS DISTINCT FROM OLD.recruiter_id)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.recruiter_id AND role::text='recruiting') THEN
    RAISE EXCEPTION 'Select a recruiting user';
  END IF;
  IF NEW.safety_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.safety_id IS DISTINCT FROM OLD.safety_id)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.safety_id AND role::text='safety') THEN
    RAISE EXCEPTION 'Select a safety user';
  END IF;
  IF NEW.dispatcher_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.dispatcher_id IS DISTINCT FROM OLD.dispatcher_id)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.dispatcher_id AND role::text='dispatch') THEN
    RAISE EXCEPTION 'Select a dispatcher';
  END IF;
  NEW.driver_name := btrim(NEW.driver_name); NEW.updated_by := auth.uid(); NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION upcoming_drivers_private.validate_write() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER upcoming_drivers_validate BEFORE INSERT OR UPDATE ON public.upcoming_drivers
 FOR EACH ROW EXECUTE FUNCTION upcoming_drivers_private.validate_write();

CREATE FUNCTION upcoming_drivers_private.record_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE prior jsonb := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  changed jsonb;
BEGIN
  SELECT coalesce(jsonb_object_agg(key, jsonb_build_object('before',prior->key,'after',value)), '{}'::jsonb)
  INTO changed FROM jsonb_each(to_jsonb(NEW))
  WHERE value IS DISTINCT FROM prior->key
    AND key NOT IN ('id','version','created_at','updated_at','created_by','updated_by',
      'transport_preview','description_preview','mvr_preview','psp_preview','ticket_preview');
  INSERT INTO public.upcoming_driver_history(upcoming_driver_id,actor_id,actor_name,operation,changes)
    VALUES(NEW.id,auth.uid(),coalesce((SELECT full_name FROM public.profiles WHERE user_id=auth.uid()),'Team member'),TG_OP,changed);
  PERFORM realtime.send(jsonb_build_object('id',NEW.id,'version',NEW.version), 'changed', 'upcoming-drivers', true);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION upcoming_drivers_private.record_change() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER upcoming_drivers_changed AFTER INSERT OR UPDATE ON public.upcoming_drivers
 FOR EACH ROW EXECUTE FUNCTION upcoming_drivers_private.record_change();

-- Existing broad realtime policies must not allow excluded roles onto this topic.
CREATE POLICY upcoming_drivers_topic_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
 USING (topic IS DISTINCT FROM 'upcoming-drivers' OR
  (SELECT upcoming_drivers_private.primary_role()) IN ('admin','manager','supervisor','safety','recruiting','chicago_management','dispatch'));
CREATE POLICY upcoming_drivers_topic_read ON realtime.messages FOR SELECT TO authenticated
 USING (topic='upcoming-drivers' AND
  (SELECT upcoming_drivers_private.primary_role()) IN ('admin','manager','supervisor','safety','recruiting','chicago_management','dispatch'));
CREATE POLICY upcoming_drivers_topic_no_client_send ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (topic IS DISTINCT FROM 'upcoming-drivers');

-- Narrow staff directory for this page; dispatch/recruiting cannot otherwise read all role rows.
CREATE FUNCTION upcoming_drivers_private.staff() RETURNS TABLE(user_id uuid, full_name text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(upcoming_drivers_private.primary_role(),'') NOT IN
    ('admin','manager','supervisor','safety','recruiting','chicago_management','dispatch') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT DISTINCT r.user_id,p.full_name,r.role::text
    FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id
    WHERE r.role::text IN ('recruiting','safety','dispatch') ORDER BY p.full_name;
END $$;
REVOKE ALL ON FUNCTION upcoming_drivers_private.staff() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION upcoming_drivers_private.staff() TO authenticated;
CREATE FUNCTION public.upcoming_driver_staff() RETURNS TABLE(user_id uuid, full_name text, role text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT * FROM upcoming_drivers_private.staff(); $$;
REVOKE ALL ON FUNCTION public.upcoming_driver_staff() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.upcoming_driver_staff() TO authenticated;

COMMENT ON COLUMN public.upcoming_drivers.arrival_date IS 'Chicago calendar date entered by the user. Never timezone-convert.';
COMMENT ON COLUMN public.upcoming_drivers.arrival_time IS 'Chicago wall-clock time entered by the user. No timezone conversion.';
