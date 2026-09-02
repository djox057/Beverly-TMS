CREATE OR REPLACE FUNCTION public.tmp_test_dispatch_assignment_rls(_uid uuid, _truck_id uuid, _trailer_id uuid, _driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  results jsonb := '[]'::jsonb;
  roles app_role[];
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);

  SELECT array_agg(role) INTO roles FROM public.user_roles WHERE user_id = _uid;

  results := jsonb_build_object(
    'simulated_user', _uid,
    'roles', to_jsonb(roles),
    'trucks_update_allowed', public.has_any_role(ARRAY['afterhours','maintenance','admin','manager','accounting','safety','supervisor']::app_role[]),
    'trailers_update_allowed', public.has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]),
    'assignment_history_insert_allowed', public.has_any_role(ARRAY['afterhours','maintenance','admin','manager','accounting','safety','supervisor']::app_role[]),
    'drivers_update_allowed_full', public.has_any_role(ARRAY['admin','manager','accounting','maintenance','safety','supervisor']::app_role[]),
    'drivers_update_allowed_dispatch_restricted', public.has_role(_uid, 'dispatch'::app_role),
    'transfer_list_restricted', (public.auth_user_roles() @> ARRAY['dispatch'::app_role]
        AND NOT public.auth_user_roles() && ARRAY['admin'::app_role,'manager'::app_role,'safety'::app_role]),
    'grants_trucks_update_authenticated', has_table_privilege('authenticated','public.trucks','UPDATE'),
    'grants_trailers_update_authenticated', has_table_privilege('authenticated','public.trailers','UPDATE')
  );

  RETURN results;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tmp_test_dispatch_assignment_rls(uuid, uuid, uuid, uuid) TO PUBLIC;