
INSERT INTO public.roadside_inspections (truck_id, driver_id, dispatcher_id, maintenance_check, reason, inspection_level)
SELECT t.id, t.driver1_id, d.dispatcher_id, NULL, NULL, NULL
FROM trucks t
LEFT JOIN drivers d ON d.id = t.driver1_id
JOIN companies c ON c.id = t.company_id
WHERE c.name IN ('BF Prime LLC', 'Beverly Freight Inc')
  AND t.status != 'inactive'
  AND NOT EXISTS (
    SELECT 1 FROM roadside_inspections ri WHERE ri.truck_id = t.id
  );
