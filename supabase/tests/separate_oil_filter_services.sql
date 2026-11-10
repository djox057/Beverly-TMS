-- Pure calculation fixtures: no production rows are inserted or edited.
DO $test$
DECLARE
  t jsonb := '{"source":"BF TRUCK","miles":168624,"miles_updated_at":"2026-09-30T12:00:00Z","last_oil_change_miles":148108,"oil_change_date":"2026-07-30","air_filter":112797}';
  combined jsonb := '{"id":"00000000-0000-0000-0000-000000000001","source_key":null,"entry_type":"Air Filter + Oil change","log_date":"2026-09-01","odometer":160000,"invoice":"INV-1","created_at":"2026-09-01T12:00:00Z","is_deleted":false}';
  oil jsonb; af jsonb; original jsonb; split jsonb; actual jsonb;
BEGIN
  oil := combined||'{"entry_type":"Oil Change"}'::jsonb;
  af := combined||'{"id":"00000000-0000-0000-0000-000000000002","source_key":"split:air-filter:original","entry_type":"Air Filter"}'::jsonb;
  original := private.fleet_service_snapshot_value(t,'[]',jsonb_build_array(combined),'2026-11-10');
  split := private.fleet_service_snapshot_value(t,'[]',jsonb_build_array(oil,af),'2026-11-10');
  IF original-'air_filter_log_entry_id' IS DISTINCT FROM split-'air_filter_log_entry_id' THEN
    RAISE EXCEPTION 'Splitting a service changed the fleet summary: %',split;
  END IF;
  IF split->>'oil_log_entry_id' = split->>'air_filter_log_entry_id' THEN
    RAISE EXCEPTION 'Oil and filter still share an edit target';
  END IF;
  actual := private.fleet_service_snapshot_value(t,'[]',jsonb_build_array(oil||'{"odometer":161000,"log_date":"2026-09-02"}'::jsonb,af),'2026-11-10');
  IF NOT actual @> '{"air_filter":160000,"last_oil_change_miles":161000,"oil_change_date":"2026-09-02","miles":168624,"miles_updated_at":"2026-09-30"}' THEN
    RAISE EXCEPTION 'Oil edit changed filter or mileage freshness: %',actual;
  END IF;
  actual := private.fleet_service_snapshot_value(t,'[]',jsonb_build_array(oil,af||'{"odometer":165000,"log_date":"2026-10-01"}'::jsonb),'2026-11-10');
  IF NOT actual @> '{"air_filter":165000,"last_oil_change_miles":160000,"oil_change_date":"2026-09-01","miles":168624,"miles_updated_at":"2026-09-30"}' THEN
    RAISE EXCEPTION 'Filter edit changed oil or mileage freshness: %',actual;
  END IF;
  actual := private.fleet_service_snapshot_value(t,'[]',jsonb_build_array(oil||'{"is_deleted":true}'::jsonb,af),'2026-11-10');
  IF NOT actual @> '{"air_filter":160000,"last_oil_change_miles":148108,"oil_change_date":"2026-07-30"}' THEN
    RAISE EXCEPTION 'Deleting oil deleted the filter: %',actual;
  END IF;
  actual := private.fleet_service_snapshot_value(t,'[]',jsonb_build_array(oil,af||'{"is_deleted":true}'::jsonb),'2026-11-10');
  IF NOT actual @> '{"air_filter":112797,"last_oil_change_miles":160000,"oil_change_date":"2026-09-01"}' THEN
    RAISE EXCEPTION 'Deleting filter deleted the oil: %',actual;
  END IF;
  actual := private.fleet_service_snapshot_value(t,'[]',jsonb_build_array(oil||'{"odometer":170000,"log_date":"2026-10-01"}'::jsonb,af),'2026-11-10');
  IF NOT actual @> '{"air_filter":160000,"miles":170000,"miles_updated_at":"2026-10-01"}' THEN
    RAISE EXCEPTION 'New oil service stopped counting as a mileage update: %',actual;
  END IF;
END;
$test$;
