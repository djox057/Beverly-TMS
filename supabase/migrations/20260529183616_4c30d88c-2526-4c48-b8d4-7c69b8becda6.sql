
INSERT INTO public.driver_company_history
  (driver_id, company_id, company_name_snapshot, started_at, ended_at, changed_by, changed_by_name_snapshot)
SELECT
  d.id,
  d.company_id,
  c.name,
  '2026-05-25 00:00:00 America/Chicago'::timestamptz,
  NULL,
  NULL,
  'Backfill current company'
FROM public.drivers d
JOIN public.companies c ON c.id = d.company_id
WHERE d.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_company_history dch
    WHERE dch.driver_id = d.id AND dch.ended_at IS NULL
  );
