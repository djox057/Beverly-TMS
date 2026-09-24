CREATE OR REPLACE FUNCTION public.is_afterhours_date_locked(_d date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _d IS NOT NULL AND (
    _d < (now() AT TIME ZONE 'America/Chicago')::date
    OR (_d = (now() AT TIME ZONE 'America/Chicago')::date
        AND (now() AT TIME ZONE 'America/Chicago')::time >= time '07:00')
  )
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_afterhours_assignment_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- allow cascade cleanup when the driver/user itself is gone
    IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = OLD.driver_id) THEN RETURN OLD; END IF;
    IF public.is_afterhours_date_locked(OLD.scheduled_date) THEN
      RAISE EXCEPTION 'Weekend assignments for % are locked (after 7:00 AM Chicago)', OLD.scheduled_date;
    END IF;
    RETURN OLD;
  END IF;
  IF public.is_afterhours_date_locked(NEW.scheduled_date)
     OR (TG_OP = 'UPDATE' AND public.is_afterhours_date_locked(OLD.scheduled_date)) THEN
    RAISE EXCEPTION 'Weekend assignments for % are locked (after 7:00 AM Chicago)', NEW.scheduled_date;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lock_afterhours_assignments ON public.afterhours_assignments;
CREATE TRIGGER trg_lock_afterhours_assignments
BEFORE INSERT OR UPDATE OR DELETE ON public.afterhours_assignments
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_afterhours_assignment_change();