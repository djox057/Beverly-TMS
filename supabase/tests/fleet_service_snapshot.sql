-- Pure fixtures: no production truck/history data is modified.
DO $test$
DECLARE
 t jsonb := '{"source":"BF TRUCK","miles":44980,"miles_updated_at":"2026-10-15T12:04:10Z","start_miles":0,"baseline_start_date":"2026-04-07","last_oil_change_miles":0,"oil_change_date":null,"air_filter":0,"last_oc_invoice":null}';
 saved jsonb := '[{"id":"00000000-0000-0000-0000-000000000001","source_key":"live:oil:undated:0","log_date":null,"entry_type":"Oil Change","odometer":0,"is_deleted":true},{"id":"00000000-0000-0000-0000-000000000002","source_key":null,"log_date":"2026-10-29","entry_type":"Oil Change","odometer":46975,"invoice":"4011244277","created_at":"2026-10-29T12:00:00Z","is_deleted":false}]';
 actual jsonb;
BEGIN
 actual:=private.fleet_service_snapshot_value(t,'[]',saved,'2026-10-30');
 IF NOT actual @> '{"miles":46975,"miles_updated_at":"2026-10-29","last_oil_change_miles":46975,"oil_change_date":"2026-10-29","last_oc_invoice":"4011244277","fleet_pm_readiness":"READY / GOOD","oil_log_entry_id":"00000000-0000-0000-0000-000000000002"}' THEN
  RAISE EXCEPTION 'Saved oil service does not match fleet readings: %',actual;
 END IF;
 actual:=private.fleet_service_snapshot_value(t,'[]',saved || '[{"id":"next","entry_type":"Air Filter + Oil change","odometer":50000,"log_date":"2026-11-02","created_at":"2026-10-30T12:00:00Z","invoice":"next"}]','2026-10-30');
 IF NOT actual @> '{"miles":50000,"last_oil_change_miles":50000,"air_filter":50000,"last_oc_invoice":"next","fleet_pm_readiness":"READY / GOOD"}' THEN
  RAISE EXCEPTION 'New oil/filter service did not advance the snapshot: %',actual;
 END IF;
 IF private.pm_readiness_value(t,'[]',saved,'2026-10-30') IS DISTINCT FROM 'READY / GOOD' THEN
  RAISE EXCEPTION 'Readiness no longer shares the snapshot calculation';
 END IF;
END;
$test$;
