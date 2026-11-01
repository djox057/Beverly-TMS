-- Explicit Daily Report permissions pin dispatch/afterhours accounts to afterhours.
-- Other roles (admin, manager, supervisor, etc.) keep their existing access.
-- Admins' implicit access does not create a permission row and is unaffected.
LOCK TABLE public.daily_report_permissions, public.user_roles IN SHARE ROW EXCLUSIVE MODE;

CREATE SCHEMA IF NOT EXISTS daily_report_private;
REVOKE ALL ON SCHEMA daily_report_private FROM PUBLIC, anon, authenticated;

-- Serialize permission and role writes for a user. The parent row also lets
-- cascading auth-user deletion proceed when the parent has already been removed.
CREATE OR REPLACE FUNCTION daily_report_private.lock_permission_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM auth.users
  WHERE id IN (NEW.user_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.user_id END)
  ORDER BY id FOR UPDATE;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION daily_report_private.sync_afterhours_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (NEW.can_view OR NEW.can_edit) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id
    AND role NOT IN ('dispatch', 'afterhours')
  ) THEN
    DELETE FROM public.user_roles WHERE user_id = NEW.user_id AND role <> 'afterhours';
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'afterhours') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

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
      -- Keep the existing row during cron flips and delete-then-insert updates.
      IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.role <> 'afterhours' THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role NOT IN ('dispatch', 'afterhours'))
     AND EXISTS (SELECT 1 FROM public.daily_report_permissions
                 WHERE user_id = NEW.user_id AND (can_view OR can_edit)) THEN
    IF NEW.role <> 'afterhours' THEN RETURN NULL; END IF;
    -- A protected delete may have kept the role already. Re-inserting it is a no-op.
    IF TG_OP = 'INSERT' AND EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'afterhours'
    ) THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION daily_report_private.lock_permission_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION daily_report_private.sync_afterhours_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION daily_report_private.guard_afterhours_role() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER daily_report_lock_permission_user
BEFORE INSERT OR UPDATE ON public.daily_report_permissions
FOR EACH ROW EXECUTE FUNCTION daily_report_private.lock_permission_user();

CREATE TRIGGER daily_report_sync_afterhours_role
AFTER INSERT OR UPDATE OF can_view, can_edit, user_id ON public.daily_report_permissions
FOR EACH ROW EXECUTE FUNCTION daily_report_private.sync_afterhours_role();

-- Normalize all existing explicitly enabled accounts before installing the guard.
DELETE FROM public.user_roles r USING public.daily_report_permissions p
WHERE r.user_id = p.user_id AND (p.can_view OR p.can_edit) AND r.role = 'dispatch'
AND NOT EXISTS (SELECT 1 FROM public.user_roles other WHERE other.user_id = r.user_id AND other.role NOT IN ('dispatch', 'afterhours'));
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'afterhours' FROM public.daily_report_permissions p
JOIN auth.users u ON u.id = p.user_id
WHERE (p.can_view OR p.can_edit)
AND NOT EXISTS (SELECT 1 FROM public.user_roles other WHERE other.user_id = p.user_id AND other.role NOT IN ('dispatch', 'afterhours'))
ON CONFLICT (user_id, role) DO NOTHING;

CREATE TRIGGER daily_report_guard_afterhours_role
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION daily_report_private.guard_afterhours_role();
