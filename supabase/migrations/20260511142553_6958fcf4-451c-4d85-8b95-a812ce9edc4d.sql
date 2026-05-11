CREATE OR REPLACE FUNCTION public.lookup_load_office(p_term text)
RETURNS TABLE (
  office text,
  is_locked boolean,
  is_canceled boolean,
  pickup_datetime timestamptz,
  driver1_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH numeric_part AS (
    SELECT split_part(p_term, '-', 1) AS np
  ),
  matched_orders AS (
    SELECT
      o.driver1_id,
      o.locked,
      o.canceled,
      o.pickup_datetime,
      CASE
        WHEN o.broker_load_number = p_term THEN 1
        WHEN (SELECT np FROM numeric_part) ~ '^\d+$'
             AND o.internal_load_number ILIKE (SELECT np FROM numeric_part) || '-%' THEN 1
        WHEN (SELECT np FROM numeric_part) ~ '^\d+$'
             AND o.internal_load_number = (SELECT np FROM numeric_part) THEN 1
        ELSE 2
      END AS match_rank
    FROM orders o, numeric_part
    WHERE o.driver1_id IS NOT NULL
      AND (
        o.broker_load_number ILIKE '%' || p_term || '%'
        OR (numeric_part.np ~ '^\d+$' AND o.internal_load_number ILIKE numeric_part.np || '%')
      )
    LIMIT 50
  ),
  by_office AS (
    SELECT
      p.office::text AS office,
      bool_or(mo.locked) AS is_locked,
      bool_or(mo.canceled) AS is_canceled,
      max(mo.pickup_datetime) AS pickup_datetime,
      (array_agg(mo.driver1_id))[1] AS driver1_id,
      min(mo.match_rank) AS best_rank
    FROM matched_orders mo
    JOIN drivers d ON d.id = mo.driver1_id
    JOIN profiles p ON p.user_id = d.dispatcher_id
    WHERE p.office IS NOT NULL
    GROUP BY p.office
  ),
  best AS (
    SELECT min(best_rank) AS r FROM by_office
  )
  SELECT office, is_locked, is_canceled, pickup_datetime, driver1_id
  FROM by_office, best
  WHERE by_office.best_rank = best.r;
$$;