
WITH driver_orders AS (
  SELECT
    drv.driver_id,
    o.pickup_datetime,
    o.created_at,
    upper(split_part(o.internal_load_number, '-', 2)) AS suffix
  FROM orders o
  CROSS JOIN LATERAL (VALUES (o.driver1_id), (o.driver2_id)) AS drv(driver_id)
  WHERE drv.driver_id IS NOT NULL
    AND o.canceled = false
    AND o.internal_load_number IS NOT NULL
    AND o.internal_load_number LIKE '%-%'
    AND o.pickup_datetime >= ('2026-05-18 00:00:00'::timestamp AT TIME ZONE 'America/Chicago')
    AND o.pickup_datetime <  ('2026-05-25 00:00:00'::timestamp AT TIME ZONE 'America/Chicago')
),
ranked AS (
  SELECT driver_id, suffix,
    ROW_NUMBER() OVER (PARTITION BY driver_id ORDER BY pickup_datetime ASC, created_at ASC) AS rn
  FROM driver_orders
  WHERE suffix IN ('BFU','BFP','BF','UE','BG','AP')
),
first_per_driver AS (
  SELECT driver_id, suffix FROM ranked WHERE rn = 1
),
mapped AS (
  SELECT
    fpd.driver_id,
    CASE fpd.suffix
      WHEN 'BFU' THEN '1c9792dd-59de-4570-8a84-bc8821b49646'::uuid
      WHEN 'BFP' THEN 'f043b212-7f0d-4420-af37-09c79ea68ad4'::uuid
      WHEN 'BF'  THEN '554f1b2f-9f95-4eb1-add7-ddd3fe168ea6'::uuid
      WHEN 'UE'  THEN '0fc3ad2c-eb06-4727-99d4-218aed6d89e7'::uuid
      WHEN 'BG'  THEN '238a7acf-cbb5-4718-be7a-130d8d971a90'::uuid
      WHEN 'AP'  THEN '52a2fc7b-28d5-4954-9434-725e71d25672'::uuid
    END AS company_id
  FROM first_per_driver fpd
)
INSERT INTO public.driver_company_history
  (driver_id, company_id, company_name_snapshot, started_at, ended_at, changed_by, changed_by_name_snapshot)
SELECT
  m.driver_id,
  m.company_id,
  c.name,
  ('2026-05-18 00:00:00'::timestamp AT TIME ZONE 'America/Chicago'),
  ('2026-05-24 23:59:59'::timestamp AT TIME ZONE 'America/Chicago'),
  NULL,
  'Backfill 5/18–5/24'
FROM mapped m
JOIN companies c ON c.id = m.company_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.driver_company_history h WHERE h.driver_id = m.driver_id
);
