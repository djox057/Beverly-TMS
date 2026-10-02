-- Apply only when reverting the supervisor access rollout.
DROP POLICY IF EXISTS "Supervisor assigned team only" ON public.orders;
DROP POLICY IF EXISTS "Supervisors can read assigned dispatcher analytics" ON public.analytics_locked_daily;
CREATE OR REPLACE FUNCTION public.auth_user_roles()
 RETURNS app_role[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN ('safety'::app_role = ANY(arr) OR 'claims'::app_role = ANY(arr))
         AND NOT ('accounting'::app_role = ANY(arr))
      THEN arr || ARRAY['accounting'::app_role]
    ELSE arr
  END
  FROM (
    SELECT COALESCE(array_agg(role), ARRAY[]::app_role[]) AS arr
    FROM public.user_roles
    WHERE user_id = auth.uid()
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'accounting'::app_role AND role IN ('safety'::app_role, 'claims'::app_role))
      )
  );
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

  IF user_roles && ARRAY['manager'::app_role, 'supervisor'::app_role]
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
    WHERE (
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

DROP POLICY IF EXISTS "Supervisors can view office analytics" ON public."analytics_dispatcher_period";
CREATE POLICY "Supervisors can view office analytics" ON public."analytics_dispatcher_period" AS PERMISSIVE FOR SELECT TO "public" USING ((( SELECT has_role(( SELECT auth.uid() AS uid), 'supervisor'::app_role) AS has_role) AND (office = ( SELECT (profiles.office)::text AS office
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Management can read analytics locked daily" ON public."analytics_locked_daily";
CREATE POLICY "Management can read analytics locked daily" ON public."analytics_locked_daily" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'accounting'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'supervisor'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'chicago_management'::app_role) AS has_role)));

DROP POLICY IF EXISTS "Supervisors can create driver performance" ON public."driver_performance";
CREATE POLICY "Supervisors can create driver performance" ON public."driver_performance" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (( SELECT has_role(( SELECT auth.uid() AS uid), 'supervisor'::app_role) AS has_role));

DROP POLICY IF EXISTS "Supervisors can create driver sensitive PII" ON public."driver_sensitive_pii";
CREATE POLICY "Supervisors can create driver sensitive PII" ON public."driver_sensitive_pii" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (( SELECT has_role(( SELECT auth.uid() AS uid), 'supervisor'::app_role) AS has_role));

DROP FUNCTION public.supervisor_can_view_order(text,uuid,uuid,uuid,uuid);
DROP FUNCTION public.supervisor_team_user_ids();
DROP FUNCTION public.is_supervisor_dispatch_user();

