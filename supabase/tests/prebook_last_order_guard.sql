-- Run inside BEGIN/ROLLBACK, after staging the migration. No fixture is committed.
CREATE TEMP TABLE prebook_guard_results (passed boolean, detail text) ON COMMIT DROP;
DO $test$
DECLARE fixture public.orders; actor uuid; created jsonb; denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true);
  SELECT * INTO fixture FROM public.orders WHERE prebook AND driver1_id IS NOT NULL AND NOT canceled LIMIT 1;
  IF fixture.id IS NULL THEN RAISE EXCEPTION 'An assigned prebook is required for this regression test'; END IF;
  SELECT user_id INTO actor FROM public.user_roles r WHERE role='dispatch'
    AND NOT public.has_role(r.user_id,'manager') AND NOT public.has_role(r.user_id,'admin') LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'A non-manager dispatcher is required for this regression test'; END IF;
  UPDATE public.orders SET is_last_order=true WHERE id=fixture.id;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  created := public.create_order_with_unique_load_number(jsonb_build_object(
    'company_id',fixture.company_id,'booked_by_company_id',fixture.booked_by_company_id,
    'driver1_id',fixture.driver1_id,'truck_id',fixture.truck_id,
    'load_number','ROLLBACK-ONLY-'||gen_random_uuid()::text,
    'booked_by','Rollback-only regression test',
    'broker_load_number','ROLLBACK-ONLY-'||gen_random_uuid()::text,
    'client_request_id',gen_random_uuid(),'pickup_datetime','2099-12-31T23:59:00Z'));
  IF (created->>'id') IS NULL THEN RAISE EXCEPTION 'New load was not created'; END IF;
  IF (SELECT is_last_order FROM public.orders WHERE id=fixture.id) THEN RAISE EXCEPTION 'Older prebook flag was not refreshed'; END IF;
  IF NOT (SELECT is_last_order FROM public.orders WHERE id=(created->>'id')::uuid) THEN RAISE EXCEPTION 'New normal load is not the last order'; END IF;
  denied:=false;
  BEGIN UPDATE public.orders SET is_last_order=true WHERE id=fixture.id;
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct dispatcher flag edit was allowed'; END IF;
  denied:=false;
  BEGIN UPDATE public.orders SET prebook_note=coalesce(prebook_note,'')||' forbidden' WHERE id=fixture.id;
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Dispatcher note edit was allowed'; END IF;
  denied:=false;
  BEGIN UPDATE public.orders SET freight_amount=coalesce(freight_amount,0)+1 WHERE id=fixture.id;
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Dispatcher freight edit was allowed'; END IF;
  INSERT INTO prebook_guard_results VALUES(true,'Normal order creation succeeds; last-order flags refresh; direct prebook flag, note and freight edits remain blocked.');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO prebook_guard_results VALUES(false,SQLERRM);
END;
$test$;
SELECT * FROM prebook_guard_results;
