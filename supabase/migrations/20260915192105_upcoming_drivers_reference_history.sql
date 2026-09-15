SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION upcoming_drivers_private.validate_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE role_name text := upcoming_drivers_private.primary_role();
BEGIN
  -- Allow only FK-driven nulling of references when a staff account or truck is
  -- deleted elsewhere. This must not block an independently authorized deletion.
  -- All candidate content, identity and scheduling fields must remain identical.
  IF TG_OP='UPDATE' AND pg_trigger_depth()>1
    AND (to_jsonb(NEW) - ARRAY['recruiter_id','safety_id','dispatcher_id','truck_id','created_by','updated_by',
      'transport_preview','description_preview','mvr_preview','psp_preview','ticket_preview'])
      IS NOT DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['recruiter_id','safety_id','dispatcher_id','truck_id','created_by','updated_by',
      'transport_preview','description_preview','mvr_preview','psp_preview','ticket_preview'])
    AND (NEW.recruiter_id IS NULL OR NEW.recruiter_id IS NOT DISTINCT FROM OLD.recruiter_id)
    AND (NEW.safety_id IS NULL OR NEW.safety_id IS NOT DISTINCT FROM OLD.safety_id)
    AND (NEW.dispatcher_id IS NULL OR NEW.dispatcher_id IS NOT DISTINCT FROM OLD.dispatcher_id)
    AND (NEW.truck_id IS NULL OR NEW.truck_id IS NOT DISTINCT FROM OLD.truck_id)
    AND (NEW.created_by IS NULL OR NEW.created_by IS NOT DISTINCT FROM OLD.created_by)
    AND (NEW.updated_by IS NULL OR NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by) THEN
    NEW.version := OLD.version+1; NEW.updated_at := now(); RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION upcoming_drivers_private.record_change() RETURNS trigger
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
    VALUES(NEW.id,(SELECT id FROM auth.users WHERE id=auth.uid()),coalesce((SELECT full_name FROM public.profiles WHERE user_id=auth.uid()),'Team member'),TG_OP,changed);
  PERFORM realtime.send(jsonb_build_object('id',NEW.id,'version',NEW.version), 'changed', 'upcoming-drivers', true);
  RETURN NEW;
END $$;
