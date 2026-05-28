-- 1) Clear obviously-bad pickup_drops coordinates (outside continental US bounds).
WITH bad AS (
  SELECT id FROM public.pickup_drops
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    AND (
      latitude  < 24.0  OR latitude  > 50.0
      OR longitude < -125.5 OR longitude > -65.0
    )
)
UPDATE public.pickup_drops pd
SET latitude = NULL, longitude = NULL
FROM bad
WHERE pd.id = bad.id;

-- 2) Reset miles_away/eta_minutes for trucks whose unlocked orders reference
--    a stop that we just cleared (so the next scheduled distance run recomputes).
WITH affected_trucks AS (
  SELECT DISTINCT o.truck_id
  FROM public.orders o
  JOIN public.pickup_drops pd ON pd.order_id = o.id
  WHERE o.locked = false
    AND o.truck_id IS NOT NULL
    AND pd.latitude IS NULL
    AND pd.longitude IS NULL
)
UPDATE public.trucks t
SET miles_away = NULL,
    eta_minutes = NULL,
    miles_away_updated_at = NULL
FROM affected_trucks a
WHERE t.id = a.truck_id;