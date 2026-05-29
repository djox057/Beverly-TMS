
WITH driver_week_company AS (
  SELECT DISTINCT ON (driver_id)
    driver_id,
    suffix,
    CASE suffix
      WHEN 'BFU' THEN '1c9792dd-7866-4a73-8b39-7b3e9eb73e2d'::uuid
      WHEN 'BFP' THEN 'f043b212-7c08-4f8a-921b-25b1a45f8c0e'::uuid
      WHEN 'BF'  THEN '554f1b2f-3c0c-4d34-aa67-9eccd8f5e3c9'::uuid
      WHEN 'UE'  THEN '0fc3ad2c-3e62-4c44-a3ba-f2cf6c5ad7c6'::uuid
      WHEN 'BG'  THEN '238a7acf-4cdb-4dfd-89a8-d4cab8f54f0a'::uuid
      WHEN 'AP'  THEN '52a2fc7b-9b39-4a73-9d4f-1d6d1c1f7bbe'::uuid
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
