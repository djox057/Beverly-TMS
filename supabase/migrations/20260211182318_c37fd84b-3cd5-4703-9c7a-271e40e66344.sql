
CREATE OR REPLACE FUNCTION public.calculate_empty_days_by_dispatcher(
  p_start_date date,
  p_end_date date,
  p_office text DEFAULT NULL
)
RETURNS TABLE(dispatcher_id uuid, office text, empty_day_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH driver_dates AS (
    SELECT d.id AS driver_id,
           d.dispatcher_id,
           p2.office::text AS office,
           dt::date AS target_date
    FROM drivers d
    JOIN profiles p2 ON p2.user_id = d.dispatcher_id
    CROSS JOIN generate_series(p_start_date::timestamp, p_end_date::timestamp, '1 day'::interval) AS dt
    WHERE d.is_active = true
      AND d.dispatcher_id IS NOT NULL
      AND p2.office IS NOT NULL
      AND (p_office IS NULL OR p2.office::text = p_office)
  ),
  driver_orders AS (
    SELECT o.driver1_id AS did,
           o.pickup_datetime::date AS pd,
           CASE
             WHEN o.original_delivery_datetime IS NOT NULL
                  AND o.original_delivery_datetime::date < o.delivery_datetime::date
             THEN o.original_delivery_datetime::date
             ELSE o.delivery_datetime::date
           END AS effective_dd
    FROM orders o
    WHERE o.canceled = false
      AND o.driver1_id IS NOT NULL
      AND o.pickup_datetime IS NOT NULL
      AND o.delivery_datetime IS NOT NULL
      AND o.pickup_datetime::date <= p_end_date
      AND o.delivery_datetime::date >= p_start_date
    UNION ALL
    SELECT o.driver2_id,
           o.pickup_datetime::date,
           CASE
             WHEN o.original_delivery_datetime IS NOT NULL
                  AND o.original_delivery_datetime::date < o.delivery_datetime::date
             THEN o.original_delivery_datetime::date
             ELSE o.delivery_datetime::date
           END
    FROM orders o
    WHERE o.canceled = false
      AND o.driver2_id IS NOT NULL
      AND o.pickup_datetime IS NOT NULL
      AND o.delivery_datetime IS NOT NULL
      AND o.pickup_datetime::date <= p_end_date
      AND o.delivery_datetime::date >= p_start_date
  ),
  empty_days AS (
    SELECT dd.dispatcher_id, dd.office, dd.driver_id, dd.target_date
    FROM driver_dates dd
    WHERE NOT EXISTS (
      SELECT 1 FROM driver_orders o
      WHERE o.did = dd.driver_id AND o.pd = dd.target_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM driver_orders o
      WHERE o.did = dd.driver_id
        AND o.pd < dd.target_date
        AND o.effective_dd > dd.target_date
    )
  )
  SELECT ed.dispatcher_id, ed.office, COUNT(*)::bigint AS empty_day_count
  FROM empty_days ed
  GROUP BY ed.dispatcher_id, ed.office;
END;
$$;
