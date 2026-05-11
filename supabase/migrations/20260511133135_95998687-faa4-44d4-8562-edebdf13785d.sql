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
    SELECT o.driver1_id, o.locked, o.canceled, o.pickup_datetime
    FROM orders o, numeric_part
    WHERE o.driver1_id IS NOT NULL
      AND (
        o.broker_load_number ILIKE '%' || p_term || '%'
        OR (numeric_part.np ~ '^\d+$' AND o.internal_load_number ILIKE numeric_part.np || '%')
      )
    LIMIT 20
  )
  SELECT
    p.office::text AS office,
    bool_or(mo.locked) AS is_locked,
    bool_or(mo.canceled) AS is_canceled,
    max(mo.pickup_datetime) AS pickup_datetime,
    (array_agg(mo.driver1_id))[1] AS driver1_id
  FROM matched_orders mo
  JOIN drivers d ON d.id = mo.driver1_id
  JOIN profiles p ON p.user_id = d.dispatcher_id
  WHERE p.office IS NOT NULL
  GROUP BY p.office;
$$;