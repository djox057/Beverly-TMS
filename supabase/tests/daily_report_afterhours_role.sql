-- Run only in an isolated test database. All fixture changes are rolled back.
BEGIN;
DO $$
DECLARE
  target uuid;
  flags record;
  exempt_role public.app_role;
BEGIN
  SELECT user_id INTO target FROM public.user_roles
  WHERE role = 'afterhours' ORDER BY user_id LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'Test requires an existing afterhours user'; END IF;

  -- Both switches independently pin the account; neither enabled releases it.
  FOR flags IN SELECT * FROM (VALUES (true, false), (false, true), (true, true)) AS f(can_view, can_edit)
  LOOP
    INSERT INTO public.daily_report_permissions (user_id, can_view, can_edit)
    VALUES (target, false, false)
    ON CONFLICT (user_id) DO UPDATE SET can_view = false, can_edit = false;
    DELETE FROM public.user_roles WHERE user_id = target;
    INSERT INTO public.user_roles (user_id, role) VALUES (target, 'dispatch');

    UPDATE public.daily_report_permissions
    SET can_view = flags.can_view, can_edit = flags.can_edit WHERE user_id = target;
    IF (SELECT array_agg(role::text) FROM public.user_roles WHERE user_id = target) IS DISTINCT FROM ARRAY['afterhours'] THEN
      RAISE EXCEPTION 'Enabling permissions must replace all roles with afterhours';
    END IF;

    -- Scheduled UPDATE and manual delete/insert attempts cannot change the role.
    UPDATE public.user_roles SET role = 'dispatch' WHERE user_id = target;
    DELETE FROM public.user_roles WHERE user_id = target;
    INSERT INTO public.user_roles (user_id, role) VALUES (target, 'dispatch'), (target, 'afterhours');
    IF (SELECT array_agg(role::text) FROM public.user_roles WHERE user_id = target) IS DISTINCT FROM ARRAY['afterhours'] THEN
      RAISE EXCEPTION 'Protected role changed or another role was added';
    END IF;

    UPDATE public.daily_report_permissions SET can_view = false, can_edit = false WHERE user_id = target;
    UPDATE public.user_roles SET role = 'dispatch' WHERE user_id = target;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = target AND role = 'dispatch') THEN
      RAISE EXCEPTION 'Turning off both permissions must allow role changes';
    END IF;
  END LOOP;
  FOREACH exempt_role IN ARRAY ARRAY['admin','manager','supervisor','safety','accounting','maintenance','chicago_management','yard','recruiting','claims','driver']::public.app_role[]
  LOOP
    UPDATE public.daily_report_permissions SET can_view = false, can_edit = false WHERE user_id = target;
    DELETE FROM public.user_roles WHERE user_id = target;
    INSERT INTO public.user_roles (user_id, role) VALUES (target, exempt_role);
    UPDATE public.daily_report_permissions SET can_view = true, can_edit = true WHERE user_id = target;
    IF (SELECT array_agg(role) FROM public.user_roles WHERE user_id = target) IS DISTINCT FROM ARRAY[exempt_role] THEN
      RAISE EXCEPTION 'Exempt role % was changed', exempt_role;
    END IF;
  END LOOP;
  FOREACH exempt_role IN ARRAY ARRAY['admin','manager','supervisor','safety','accounting','maintenance','chicago_management','yard','recruiting','claims','driver']::public.app_role[]
  LOOP
    UPDATE public.daily_report_permissions SET can_view = false, can_edit = false WHERE user_id = target;
    DELETE FROM public.user_roles WHERE user_id = target;
    INSERT INTO public.user_roles (user_id, role) VALUES (target, 'afterhours');
    UPDATE public.daily_report_permissions SET can_view = true, can_edit = true WHERE user_id = target;

    -- The API saves a replacement before removing the protected old role.
    INSERT INTO public.user_roles (user_id, role) VALUES (target, exempt_role)
    ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;
    DELETE FROM public.user_roles WHERE user_id = target AND role <> exempt_role;
    IF (SELECT array_agg(role) FROM public.user_roles WHERE user_id = target) IS DISTINCT FROM ARRAY[exempt_role] THEN
      RAISE EXCEPTION 'Manual promotion to % must leave exactly the selected role', exempt_role;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.daily_report_permissions WHERE user_id = target AND can_view AND can_edit) THEN
      RAISE EXCEPTION 'Manual promotion changed Daily Report permissions';
    END IF;

    -- Direct UPDATE is also allowed for non-dispatch role changes.
    UPDATE public.daily_report_permissions SET can_view = false, can_edit = false WHERE user_id = target;
    UPDATE public.user_roles SET role = 'afterhours' WHERE user_id = target;
    UPDATE public.daily_report_permissions SET can_view = true, can_edit = true WHERE user_id = target;
    UPDATE public.user_roles SET role = exempt_role WHERE user_id = target;
    IF (SELECT array_agg(role) FROM public.user_roles WHERE user_id = target) IS DISTINCT FROM ARRAY[exempt_role] THEN
      RAISE EXCEPTION 'Direct role update to % was blocked', exempt_role;
    END IF;
  END LOOP;
END;
$$;
ROLLBACK;
