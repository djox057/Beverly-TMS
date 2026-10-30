-- Pure fixtures: no fleet data is changed.
DO $test$
DECLARE
 t jsonb := '{"source":"BF TRUCK","miles":168624,"miles_updated_at":"2026-09-30T12:00:00Z","last_oil_change_miles":148108,"oil_change_date":"2026-07-30"}';
 kind text;
 actual text;
BEGIN
 FOREACH kind IN ARRAY ARRAY['Oil Change','Air Filter + Oil change'] LOOP
  actual := private.pm_readiness_value(t, '[]', jsonb_build_array(jsonb_build_object('id','service','entry_type',kind,'odometer',170000,'log_date','2026-10-08','created_at','2026-10-08T12:00:00Z')), '2026-10-08');
  IF actual IS DISTINCT FROM 'READY / GOOD' THEN RAISE EXCEPTION 'Oil mileage check failed: % = %', kind, actual; END IF;
 END LOOP;
 actual := private.pm_readiness_value(t || '{"oil_change_date":"2026-09-30","last_oil_change_miles":169000}', '[]', '[]', '2026-10-08');
 IF actual IS DISTINCT FROM 'READY / GOOD' THEN RAISE EXCEPTION 'Same-day oil mileage failed: %', actual; END IF;
 actual := private.pm_readiness_value(t || '{"miles":405618,"miles_updated_at":"2026-11-02T00:00:00Z","oil_change_date":"2026-11-02","last_oil_change_miles":405618}', '[]', '[{"id":"previous","entry_type":"Oil Change","log_date":"2026-06-18","odometer":368128}]', '2026-10-30');
 IF actual IS DISTINCT FROM 'READY / GOOD' THEN RAISE EXCEPTION 'Future oil service was excluded: %', actual; END IF;
 -- A backdated service must not replace a newer mileage reading, even if its odometer is higher.
 actual := private.pm_readiness_value(t || '{"oil_change_date":"2026-09-01","last_oil_change_miles":170000}', '[]', '[]', '2026-10-08');
 IF actual IS DISTINCT FROM 'CHECK ODOMETER' THEN RAISE EXCEPTION 'Backdated oil replaced newer mileage: %', actual; END IF;
END;
$test$;
