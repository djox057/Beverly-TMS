-- Keep the original row (and oil edit target); copy the air-filter service
-- into an independent row. All historical values and deletion markers survive.
-- Fail rather than block production for a long time if another writer is busy.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
LOCK TABLE public.truck_service_log_entries IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.trucks IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE private.oil_filter_split_trucks_backup (
  truck_id uuid PRIMARY KEY,
  truck_before jsonb NOT NULL,
  history_before jsonb NOT NULL,
  entries_before jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.oil_filter_split_entries_backup (
  original_id uuid PRIMARY KEY,
  air_entry_id uuid NOT NULL UNIQUE,
  original jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.oil_filter_split_trucks_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.oil_filter_split_entries_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.oil_filter_split_trucks_backup, private.oil_filter_split_entries_backup
  FROM PUBLIC, anon, authenticated, service_role;

-- Capture the entire fleet, including inactive trucks, for an exact before/after
-- comparison. Backups are private and deliberately have no cascading FKs.
INSERT INTO private.oil_filter_split_trucks_backup (truck_id,truck_before,history_before,entries_before)
SELECT t.id,to_jsonb(t),
  coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.changed_at,h.id)
    FROM public.truck_mileage_history h WHERE h.truck_id=t.id),'[]'),
  coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.log_date,s.id)
    FROM public.truck_service_log_entries s WHERE s.truck_id=t.id),'[]')
FROM public.trucks t;

INSERT INTO private.oil_filter_split_entries_backup (original_id,air_entry_id,original)
SELECT id,md5('split:air-filter:'||id::text)::uuid,to_jsonb(s)
FROM public.truck_service_log_entries s WHERE entry_type='Air Filter + Oil change';

-- A collision must abort instead of overwriting or silently skipping history.
DO $guard$
BEGIN
  IF EXISTS (SELECT FROM private.oil_filter_split_entries_backup b
    JOIN public.truck_service_log_entries s ON s.id=b.air_entry_id
      OR (s.truck_id=(b.original->>'truck_id')::uuid AND s.source_key='split:air-filter:'||b.original_id::text)) THEN
    RAISE EXCEPTION 'Oil/filter split identity collision; no changes applied';
  END IF;
END;
$guard$;

UPDATE public.truck_service_log_entries
SET entry_type='Oil Change' WHERE entry_type='Air Filter + Oil change';

INSERT INTO public.truck_service_log_entries
  (id,truck_id,source_key,log_date,entry_type,odometer,oil_spec,facility,invoice,notes,created_at,created_by,is_deleted)
SELECT b.air_entry_id,s.truck_id,'split:air-filter:'||s.id::text,s.log_date,'Air Filter',s.odometer,
  s.oil_spec,s.facility,s.invoice,s.notes,s.created_at,s.created_by,s.is_deleted
FROM private.oil_filter_split_entries_backup b
JOIN public.truck_service_log_entries s ON s.id=b.original_id;

-- The existing triggers refresh derived snapshots transactionally. Only the
-- filter edit target may change; every displayed value and raw field must match.
DO $verify$
BEGIN
  IF EXISTS (SELECT FROM private.oil_filter_split_trucks_backup b JOIN public.trucks t ON t.id=b.truck_id
    WHERE (b.truck_before->'fleet_service_snapshot')-'air_filter_log_entry_id'
      IS DISTINCT FROM t.fleet_service_snapshot-'air_filter_log_entry_id'
    OR (b.truck_before - ARRAY['fleet_service_snapshot','fleet_pm_readiness','updated_at'])
      IS DISTINCT FROM (to_jsonb(t) - ARRAY['fleet_service_snapshot','fleet_pm_readiness','updated_at'])
    OR b.truck_before->>'fleet_pm_readiness' IS DISTINCT FROM t.fleet_pm_readiness) THEN
    RAISE EXCEPTION 'Oil/filter split changed fleet values; entire migration rolled back';
  END IF;
  IF EXISTS (SELECT FROM private.oil_filter_split_entries_backup b
    LEFT JOIN public.truck_service_log_entries o ON o.id=b.original_id
    LEFT JOIN public.truck_service_log_entries a ON a.id=b.air_entry_id
    WHERE to_jsonb(o) IS DISTINCT FROM b.original||jsonb_build_object('entry_type','Oil Change')
      OR to_jsonb(a) IS DISTINCT FROM b.original||jsonb_build_object(
        'id',b.air_entry_id,'source_key','split:air-filter:'||b.original_id::text,'entry_type','Air Filter')) THEN
    RAISE EXCEPTION 'Oil/filter split lost historical metadata; entire migration rolled back';
  END IF;
END;
$verify$;

-- Old browser sessions and direct writes cannot reintroduce shared services.
ALTER TABLE public.truck_service_log_entries DROP CONSTRAINT truck_service_log_entries_entry_type_check;
ALTER TABLE public.truck_service_log_entries ADD CONSTRAINT truck_service_log_entries_entry_type_check
  CHECK (entry_type IN ('Mileage Check','Oil Change','Air Filter','Baseline Start'));
