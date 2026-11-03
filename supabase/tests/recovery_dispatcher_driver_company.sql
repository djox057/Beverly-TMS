BEGIN;
CREATE TEMP TABLE test_driver_company (LIKE public.drivers);
CREATE TRIGGER restrict_test BEFORE UPDATE ON test_driver_company
FOR EACH ROW EXECUTE FUNCTION public.restrict_dispatcher_driver_updates();
INSERT INTO test_driver_company SELECT * FROM public.drivers LIMIT 1;
DO $test$
DECLARE
  actor uuid;
  recovery_enabled boolean;
  original_company uuid;
  target_company uuid;
  actual_company uuid;
  original_name text;
  actual_name text;
BEGIN
  SELECT company_id, first_name INTO original_company, original_name FROM test_driver_company;
  target_company := gen_random_uuid();
  FOREACH recovery_enabled IN ARRAY ARRAY[false,true] LOOP
    SELECT p.user_id INTO actor FROM public.profiles p
    WHERE p.is_recovery = recovery_enabled
      AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p.user_id AND r.role='dispatch')
      AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p.user_id
        AND r.role IN ('admin','manager','accounting','safety','supervisor'))
    LIMIT 1;
    IF actor IS NULL THEN RAISE EXCEPTION 'Missing dispatch test actor'; END IF;
    PERFORM set_config('request.jwt.claim.sub', actor::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated')::text, true);
    UPDATE test_driver_company SET company_id=target_company, first_name='restricted test';
    SELECT company_id, first_name INTO actual_company, actual_name FROM test_driver_company;
    IF actual_company IS DISTINCT FROM (CASE WHEN recovery_enabled THEN target_company ELSE original_company END)
      THEN RAISE EXCEPTION 'Company permission failed, recovery=%', recovery_enabled; END IF;
    IF actual_name IS DISTINCT FROM original_name THEN RAISE EXCEPTION 'Other restrictions changed'; END IF;
  END LOOP;
END $test$;
ROLLBACK;