-- Always rolls back: no test loads remain. Run as postgres against a seeded TMS DB.
BEGIN;
DO $$
DECLARE
  admin_id uuid; company uuid; broker uuid; data jsonb; entries jsonb; locations jsonb;
  result jsonb; repeated jsonb;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  SELECT id INTO company FROM public.companies WHERE name='BF Prime LLC' LIMIT 1;
  SELECT id INTO broker FROM public.brokers LIMIT 1;
  IF admin_id IS NULL OR company IS NULL OR broker IS NULL THEN RAISE EXCEPTION 'Missing test fixtures'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  data := jsonb_build_object('company_id',company,'booked_by_company_id',company,'broker_id',broker,'booked_by','Batch test (rolled back)','prebook',true,'freight_amount',2500,'loaded_miles',1000);
  entries := jsonb_build_array(
    jsonb_build_object('load_number','TEST-PREBOOK-BATCH-A','request_id',gen_random_uuid()),
    jsonb_build_object('load_number','TEST-PREBOOK-BATCH-B','request_id',gen_random_uuid()),
    jsonb_build_object('load_number','TEST-PREBOOK-BATCH-C','request_id',gen_random_uuid())
  );
  locations := '[{"type":"pickup","sequence_number":1,"address":"Chicago IL","city":"Chicago","state":"IL","datetime":"2026-10-20 08:00:00+00"},{"type":"delivery","sequence_number":2,"address":"Dallas TX","city":"Dallas","state":"TX","datetime":"2026-10-21 08:00:00+00"}]';
  SET LOCAL ROLE authenticated;
  result := public.create_load_batch(data, entries, locations);
  repeated := public.create_load_batch(data, entries, locations);
  IF result <> repeated THEN RAISE EXCEPTION 'Retry returned different loads'; END IF;
  IF (SELECT count(DISTINCT x->>'internal_load_number') FROM jsonb_array_elements(result) x) <> 3 THEN RAISE EXCEPTION 'Numbers are not unique'; END IF;
  IF (SELECT count(*) FROM public.orders WHERE id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(result) x) AND prebook AND truck_id IS NULL AND trailer_id IS NULL AND driver1_id IS NULL AND driver2_id IS NULL) <> 3 THEN RAISE EXCEPTION 'Prebook assignment test failed'; END IF;
  IF (SELECT count(*) FROM public.pickup_drops WHERE order_id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(result) x)) <> 6 THEN RAISE EXCEPTION 'Stop count mismatch'; END IF;
  -- Reject duplicate load numbers.
  BEGIN
    PERFORM public.create_load_batch(data, jsonb_build_array(entries->0, (entries->1) || jsonb_build_object('load_number','TEST-PREBOOK-BATCH-A')), locations);
    RAISE EXCEPTION 'Duplicate load number accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Each load needs a different load number and request ID' THEN RAISE; END IF;
  END;
  -- A bad stop must roll back every order created by that call.
  BEGIN
    PERFORM public.create_load_batch(data, jsonb_build_array(jsonb_build_object('load_number','TEST-BATCH-ROLLBACK','request_id',gen_random_uuid())), jsonb_set(locations,'{1,sequence_number}','"invalid"'));
    RAISE EXCEPTION 'Bad stop accepted';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.orders WHERE broker_load_number='TEST-BATCH-ROLLBACK') THEN RAISE EXCEPTION 'Partial batch was persisted'; END IF;
  RESET ROLE;
  -- Signed-in non-manager cannot call this endpoint.
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.create_load_batch(data, entries, locations);
    RAISE EXCEPTION 'Unauthorized caller accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;
ROLLBACK;
