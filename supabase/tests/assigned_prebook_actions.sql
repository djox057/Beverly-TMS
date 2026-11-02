-- Execute after the migration. Every change, including the real-order
-- cancellation used to exercise RLS and all triggers, is rolled back.
BEGIN;
CREATE TEMP TABLE assigned_prebook_fixture AS
SELECT o.* FROM public.orders o
JOIN public.drivers d ON d.id = o.driver1_id
WHERE o.prebook AND o.p_status = 'Covered' AND NOT o.canceled AND NOT o.locked
  AND o.truck_id IS NOT NULL
  AND public.has_role(d.dispatcher_id, 'dispatch')
  AND NOT public.has_role(d.dispatcher_id, 'manager')
  AND NOT public.has_role(d.dispatcher_id, 'admin')
LIMIT 1;
CREATE TEMP TABLE assigned_prebook_guard AS SELECT * FROM assigned_prebook_fixture;
CREATE TEMP TABLE assigned_prebook_actors AS
SELECT d.dispatcher_id AS actor,
  (SELECT r.user_id FROM public.user_roles r
   WHERE r.role = 'dispatch' AND r.user_id <> d.dispatcher_id
     AND NOT public.has_role(r.user_id, 'admin') AND NOT public.has_role(r.user_id, 'manager')
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = r.user_id
       AND (f.booked_by = p.full_name OR f.booked_by = p.user_id::text))
     AND NOT EXISTS (SELECT 1 FROM public.drivers d2
       WHERE d2.id IN (f.driver1_id, f.driver2_id) AND d2.dispatcher_id = r.user_id)
   LIMIT 1) AS other_actor
FROM assigned_prebook_fixture f JOIN public.drivers d ON d.id = f.driver1_id;
CREATE TRIGGER test_prebook_guard BEFORE UPDATE ON assigned_prebook_guard
FOR EACH ROW EXECUTE FUNCTION public.guard_prebook_edits();
GRANT SELECT, UPDATE ON assigned_prebook_guard TO authenticated;
GRANT SELECT ON assigned_prebook_fixture TO authenticated;
GRANT SELECT ON assigned_prebook_actors TO authenticated;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE fixture public.orders; actor uuid; other_actor uuid; denied boolean;
BEGIN
  SELECT * INTO fixture FROM assigned_prebook_fixture;
  IF fixture.id IS NULL THEN RAISE EXCEPTION 'Covered prebook fixture required'; END IF;
  SELECT a.actor, a.other_actor INTO actor, other_actor FROM assigned_prebook_actors a;
  IF other_actor IS NULL THEN RAISE EXCEPTION 'Unrelated dispatcher fixture required'; END IF;

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  -- Full production cancellation path, with RLS and every orders trigger.
  UPDATE public.orders SET canceled = true, freight_amount = 0, driver_price = 0,
    loaded_miles = 0, mileage = 0, dh_miles = 0, tonu = 0, tonu_driver = 0,
    notes = 'ROLLBACK ONLY prebook cancellation test' WHERE id = fixture.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS prevented assigned dispatcher cancellation'; END IF;
  IF NOT (SELECT canceled FROM public.orders WHERE id = fixture.id) THEN
    RAISE EXCEPTION 'Cancellation did not persist within transaction';
  END IF;
  UPDATE public.orders SET canceled = false, freight_amount = fixture.freight_amount,
    driver_price = fixture.driver_price, loaded_miles = fixture.loaded_miles,
    mileage = fixture.mileage, dh_miles = fixture.dh_miles,
    tonu = fixture.tonu, tonu_driver = fixture.tonu_driver, notes = fixture.notes
  WHERE id = fixture.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS prevented cancellation restoration'; END IF;

  -- Exercise guard fields in an isolated copy, avoiding assignment side effects.
  UPDATE assigned_prebook_guard SET freight_amount = coalesce(freight_amount,0) + 1,
    prebook_note = 'assigned dispatcher note', canceled = true;
  UPDATE assigned_prebook_guard SET canceled = false;
  UPDATE assigned_prebook_guard SET p_status = 'Canceled', canceled = true;
  UPDATE assigned_prebook_guard SET p_status = 'Available', canceled = false;
  UPDATE assigned_prebook_guard SET trailer_id = NULL, driver2_id = NULL,
    booked_by_company_id = NULL, company_id = NULL, is_last_order = NOT is_last_order;

  -- Current driver assignment also works if booked_by still names somebody else.
  UPDATE assigned_prebook_guard SET booked_by = 'Different booking owner';
  UPDATE assigned_prebook_guard SET driver_price = coalesce(driver_price,0) + 1;

  PERFORM set_config('request.jwt.claim.sub', other_actor::text, true);
  denied := false;
  BEGIN
    UPDATE assigned_prebook_guard SET canceled = true;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unrelated dispatcher could cancel assigned prebook'; END IF;

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  UPDATE assigned_prebook_guard SET truck_id = NULL, driver1_id = NULL, p_status = 'Available';
  denied := false;
  BEGIN
    UPDATE assigned_prebook_guard SET truck_id = fixture.truck_id,
      driver1_id = fixture.driver1_id, canceled = true;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unassigned prebook could bypass via NEW assignment'; END IF;
END;
$test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: assigned cancellation, restoration, financial and assignment edits; stale booker; unrelated and unassigned dispatcher restrictions' AS result;
