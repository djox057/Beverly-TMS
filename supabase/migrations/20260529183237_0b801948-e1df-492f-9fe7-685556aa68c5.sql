
WITH driver_week_company AS (
  SELECT DISTINCT ON (driver_id)
    driver_id,
    suffix,
    CASE suffix
      WHEN 'BFU' THEN '1c9792dd-59de-4570-8a84-bc8821b49646'::uuid
      WHEN 'BFP' THEN 'f043b212-7f0d-4420-af37-09c79ea68ad4'::uuid
      WHEN 'BF'  THEN '554f1b2f-9f95-4eb1-add7-ddd3fe168ea6'::uuid
      WHEN 'UE'  THEN '0fc3ad2c-eb06-4727-99d4-218aed6d89e7'::uuid
      WHEN 'BG'  THEN '238a7acf-cbb5-4718-be7a-130d8d971a90'::uuid
      WHEN 'AP'  THEN '52a2fc7b-28d5-4954-9434-725e71d25672'::uuid
    END AS company_id
  FROM (
    SELECT
      d.driver_id,
      upper(split_part(o.internal_load_number, '-', 2)) AS suffix,
      o.pickup_datetime,
      o.created_at
    FROM public.orders o
    CROSS JOIN LATERAL (VALUES (o.driver1_id), (o.driver2_id)) AS d(driver_id)
    WHERE d.driver_id IS NOT NULL
      AND o.status <> 'CANCELED'
      AND o.pickup_datetime >= '2026-05-18 00:00:00 America/Chicago'::timestamptz
      AND o.pickup_datetime <  '2026-05-25 00:00:00 America/Chicago'::timestamptz
      AND o.internal_load_number IS NOT NULL
      AND upper(split_part(o.internal_load_number, '-', 2)) IN ('BFU','BFP','BF','UE','BG','AP')
  ) s
  ORDER BY driver_id, pickup_datetime ASC, created_at ASC
),
resolved AS (
  SELECT dwc.driver_id, dwc.suffix, c.id AS company_id, c.name AS company_name
  FROM driver_week_company dwc
  JOIN public.companies c ON c.id = dwc.company_id
),
deleted AS (
  DELETE FROM public.driver_company_history dch
  USING resolved r
  WHERE dch.driver_id = r.driver_id
  RETURNING dch.driver_id
)
INSERT INTO public.driver_company_history
  (driver_id, company_id, company_name_snapshot, started_at, ended_at, changed_by, changed_by_name_snapshot)
SELECT
  r.driver_id,
  r.company_id,
  r.company_name,
  '2026-05-18 00:00:00 America/Chicago'::timestamptz,
  '2026-05-24 23:59:59 America/Chicago'::timestamptz,
  NULL,
  'Backfill 5/18–5/24'
FROM resolved r;
