-- Update all trucks to have the same company_id as their assigned driver
UPDATE trucks t
SET company_id = d.company_id
FROM drivers d
WHERE t.driver1_id = d.id
  AND (t.company_id IS DISTINCT FROM d.company_id OR (t.company_id IS NULL AND d.company_id IS NOT NULL));