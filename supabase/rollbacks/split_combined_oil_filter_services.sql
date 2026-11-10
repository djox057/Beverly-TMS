-- Run the whole file as a single transaction, only if reverting this feature.
-- Refuse to overwrite any service that has been edited since the split.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
LOCK TABLE public.truck_service_log_entries IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.trucks IN SHARE ROW EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS (SELECT FROM private.oil_filter_split_entries_backup b
    LEFT JOIN public.truck_service_log_entries o ON o.id=b.original_id
    LEFT JOIN public.truck_service_log_entries a ON a.id=b.air_entry_id
    WHERE to_jsonb(o) IS DISTINCT FROM b.original||jsonb_build_object('entry_type','Oil Change')
      OR to_jsonb(a) IS DISTINCT FROM b.original||jsonb_build_object(
        'id',b.air_entry_id,'source_key','split:air-filter:'||b.original_id::text,'entry_type','Air Filter')) THEN
    RAISE EXCEPTION 'Services have changed since splitting; review edits before rollback';
  END IF;
END;
$guard$;
CREATE TEMP TABLE oil_filter_rollback_before ON COMMIT DROP AS
SELECT id,fleet_service_snapshot,fleet_pm_readiness FROM public.trucks;
ALTER TABLE public.truck_service_log_entries DROP CONSTRAINT truck_service_log_entries_entry_type_check;
ALTER TABLE public.truck_service_log_entries ADD CONSTRAINT truck_service_log_entries_entry_type_check
  CHECK (entry_type IN ('Mileage Check','Oil Change','Air Filter','Air Filter + Oil change','Baseline Start'));
DELETE FROM public.truck_service_log_entries a USING private.oil_filter_split_entries_backup b WHERE a.id=b.air_entry_id;
UPDATE public.truck_service_log_entries o SET entry_type='Air Filter + Oil change'
FROM private.oil_filter_split_entries_backup b WHERE o.id=b.original_id;
DO $verify$
BEGIN
  IF EXISTS (SELECT FROM oil_filter_rollback_before b JOIN public.trucks t ON t.id=b.id
    WHERE b.fleet_service_snapshot-'air_filter_log_entry_id' IS DISTINCT FROM t.fleet_service_snapshot-'air_filter_log_entry_id'
      OR b.fleet_pm_readiness IS DISTINCT FROM t.fleet_pm_readiness) THEN
    RAISE EXCEPTION 'Rollback changed fleet values; rollback aborted';
  END IF;
END;
$verify$;
-- Keep the private audit backups for reference. Coordinate the matching app rollback.
COMMIT;
