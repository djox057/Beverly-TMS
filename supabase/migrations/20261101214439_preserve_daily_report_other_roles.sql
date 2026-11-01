-- Only dispatch/afterhours accounts are pinned. All other roles retain their role.
LOCK TABLE public.daily_report_permissions, public.user_roles IN SHARE ROW EXCLUSIVE MODE;

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

