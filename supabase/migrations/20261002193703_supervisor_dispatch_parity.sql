-- Supervisor is a dispatcher with assigned-team visibility, not a management role.
CREATE OR REPLACE FUNCTION public.auth_user_roles()
RETURNS public.app_role[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN ('safety'::app_role = ANY(arr) OR 'claims'::app_role = ANY(arr))
      AND NOT ('accounting'::app_role = ANY(arr))
    THEN arr || ARRAY['accounting'::app_role] ELSE arr END
  FROM (
    SELECT COALESCE(array_agg(DISTINCT CASE WHEN role = 'supervisor'::app_role
      THEN 'dispatch'::app_role ELSE role END), ARRAY[]::app_role[]) arr
    FROM public.user_roles WHERE user_id = auth.uid()
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND (
      role = _role
      OR (_role = 'dispatch'::app_role AND role = 'supervisor'::app_role)
      OR (_role = 'accounting'::app_role AND role IN ('safety'::app_role, 'claims'::app_role))
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_supervisor_dispatch_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'supervisor'::app_role)
    AND NOT public.has_any_role(ARRAY['admin','manager','accounting','safety','maintenance','chicago_management']::app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.supervisor_team_user_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT user_id), ARRAY[]::uuid[])
  FROM (
    SELECT auth.uid() user_id WHERE auth.uid() IS NOT NULL
    UNION ALL
    SELECT dispatcher_id FROM public.dispatcher_supervisors WHERE supervisor_id = auth.uid()
  ) team;
$function$;

CREATE OR REPLACE FUNCTION public.supervisor_can_view_order(
  _booked_by text, _driver1 uuid, _driver2 uuid, _original_driver1 uuid, _original_driver2 uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
  WITH team AS (SELECT unnest(public.supervisor_team_user_ids()) user_id)
  SELECT NOT public.is_supervisor_dispatch_user() OR
    _booked_by IN (SELECT user_id::text FROM team) OR
    _booked_by IN (SELECT p.full_name FROM public.profiles p JOIN team t ON p.user_id = t.user_id) OR
    EXISTS (
      SELECT 1 FROM public.drivers d JOIN team t ON d.dispatcher_id = t.user_id
      WHERE d.id IN (_driver1, _driver2, _original_driver1, _original_driver2)
    );
$function$;
REVOKE ALL ON FUNCTION public.is_supervisor_dispatch_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisor_team_user_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisor_can_view_order(text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_supervisor_dispatch_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisor_team_user_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisor_can_view_order(text,uuid,uuid,uuid,uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Supervisor assigned team only" ON public.orders;
CREATE POLICY "Supervisor assigned team only" ON public.orders AS RESTRICTIVE FOR ALL TO authenticated
USING (public.supervisor_can_view_order(booked_by, driver1_id, driver2_id, original_driver1_id, original_driver2_id))
WITH CHECK (public.supervisor_can_view_order(booked_by, driver1_id, driver2_id, original_driver1_id, original_driver2_id));

DROP POLICY IF EXISTS "Supervisors can create driver performance" ON public.driver_performance;
DROP POLICY IF EXISTS "Supervisors can create driver sensitive PII" ON public.driver_sensitive_pii;

ALTER POLICY "Supervisors can view office analytics" ON public.analytics_dispatcher_period
USING (public.is_supervisor_dispatch_user() AND dispatcher_id = ANY(public.supervisor_team_user_ids()));

ALTER POLICY "Management can read analytics locked daily" ON public.analytics_locked_daily
USING (public.has_any_role(ARRAY['admin','manager','accounting','chicago_management']::app_role[]));
DROP POLICY IF EXISTS "Supervisors can read assigned dispatcher analytics" ON public.analytics_locked_daily;
CREATE POLICY "Supervisors can read assigned dispatcher analytics" ON public.analytics_locked_daily FOR SELECT TO authenticated
USING (public.is_supervisor_dispatch_user() AND entity_type = 'dispatcher'
  AND (entity_id IN (SELECT unnest(public.supervisor_team_user_ids())::text)
    OR entity_id IN (SELECT full_name FROM public.profiles WHERE user_id = ANY(public.supervisor_team_user_ids()))));

CREATE OR REPLACE FUNCTION public.search_orders_ids(p_term text, p_booked_by text DEFAULT NULL::text, p_dispatcher_user_id uuid DEFAULT NULL::uuid, p_excluded_booked_by_company_id text DEFAULT NULL::text, p_booked_by_company_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_all boolean;
  v_is_driver  boolean;
  v_is_yard    boolean;
  v_driver_id  uuid;
  v_result uuid[];
  v_excluded uuid[];
BEGIN
  IF length(coalesce(p_term,'')) < 3 THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  IF p_excluded_booked_by_company_id IS NOT NULL AND length(p_excluded_booked_by_company_id) > 0 THEN
    SELECT array_agg(x::uuid) INTO v_excluded
    FROM unnest(string_to_array(p_excluded_booked_by_company_id, ',')) AS x
    WHERE length(x) > 0;
  END IF;

  v_can_view_all := public.has_any_role(
    ARRAY['dispatch','afterhours','manager','admin','accounting',
          'supervisor','safety','maintenance','chicago_management']::app_role[]
  );
  v_is_driver := public.has_role(v_uid, 'driver'::app_role);
  v_is_yard   := public.has_role(v_uid, 'yard'::app_role);

  IF NOT (v_can_view_all OR v_is_driver OR v_is_yard) THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  IF v_is_driver AND NOT v_can_view_all THEN
    v_driver_id := public.get_driver_id_for_user();
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY created_at DESC), ARRAY[]::uuid[])
  INTO v_result
  FROM (
    SELECT o.id, o.created_at
    FROM public.orders o
    WHERE public.supervisor_can_view_order(o.booked_by, o.driver1_id, o.driver2_id, o.original_driver1_id, o.original_driver2_id)
      AND (
        o.broker_load_number  ILIKE '%' || p_term || '%'
        OR o.internal_load_number ILIKE '%' || p_term || '%'
      )
      AND (
        p_dispatcher_user_id IS NULL
        OR (p_booked_by IS NOT NULL AND o.booked_by = p_booked_by)
        OR o.driver1_id IN (
          SELECT id FROM public.drivers WHERE dispatcher_id = p_dispatcher_user_id
        )
      )
      AND (
        v_excluded IS NULL
        OR o.booked_by_company_id IS NULL
        OR o.booked_by_company_id <> ALL (v_excluded)
      )
      AND (p_booked_by_company_id IS NULL OR o.booked_by_company_id = p_booked_by_company_id)
      AND (
        v_can_view_all
        OR (v_is_driver AND (o.driver1_id = v_driver_id OR o.driver2_id = v_driver_id))
        OR (v_is_yard AND o.driver1_id IS NULL AND o.truck_id IS NULL)
      )
    ORDER BY o.created_at DESC
    LIMIT p_limit
  ) m;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_manager_supervisor_restricted_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_roles app_role[];
BEGIN
  user_roles := public.auth_user_roles();

  IF (user_roles && ARRAY['manager'::app_role] OR public.has_role(auth.uid(), 'supervisor'::app_role))
     AND NOT user_roles && ARRAY['admin'::app_role, 'accounting'::app_role]
  THEN
    IF OLD.locked IS DISTINCT FROM NEW.locked THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change lock status';
    END IF;
    IF OLD.invoiced IS DISTINCT FROM NEW.invoiced THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change invoiced status';
    END IF;
    IF OLD.invoiced_at IS DISTINCT FROM NEW.invoiced_at THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change invoiced_at';
    END IF;
    IF OLD.paid IS DISTINCT FROM NEW.paid THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change paid status';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

