-- Daily Report blocks dispatch flips, not manual administrative role changes.
CREATE OR REPLACE FUNCTION daily_report_private.guard_afterhours_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM auth.users
  WHERE id IN (
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id END
  ) ORDER BY id FOR UPDATE;

  IF TG_OP <> 'INSERT' THEN
    IF OLD.role = 'afterhours'
       AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = OLD.user_id AND role NOT IN ('dispatch', 'afterhours'))
       AND EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id)
       AND EXISTS (SELECT 1 FROM public.daily_report_permissions
                   WHERE user_id = OLD.user_id AND (can_view OR can_edit)) THEN
      -- Keep afterhours during automatic dispatch flips and until a replacement role exists.
      -- Manual updates to manager, supervisor, and other roles are allowed.
      IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.role = 'dispatch' THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role NOT IN ('dispatch', 'afterhours'))
     AND EXISTS (SELECT 1 FROM public.daily_report_permissions
                 WHERE user_id = NEW.user_id AND (can_view OR can_edit)) THEN
    IF NEW.role = 'dispatch' THEN RETURN NULL; END IF;
    -- A protected delete may have kept the role already. Re-inserting it is a no-op.
    IF TG_OP = 'INSERT' AND NEW.role = 'afterhours' AND EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'afterhours'
    ) THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

