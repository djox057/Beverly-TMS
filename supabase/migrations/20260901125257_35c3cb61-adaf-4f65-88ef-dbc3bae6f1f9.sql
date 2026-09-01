DROP FUNCTION IF EXISTS public.get_facility_visit_counts();
DROP FUNCTION IF EXISTS public.get_facility_visit_counts(date, date);

CREATE OR REPLACE FUNCTION public.get_facility_visit_counts(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_exclude_broker_ids uuid[] DEFAULT NULL
)
 RETURNS TABLE(address text, city text, state text, zip_code text, company_name text, pickup_count bigint, delivery_count bigint, total_visits bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH gridded AS (
    SELECT pd.*,
      ROUND(pd.latitude::numeric * 10, 1) AS lat_cell,
      ROUND(pd.longitude::numeric * 10, 1) AS lng_cell
    FROM pickup_drops pd
    WHERE pd.latitude IS NOT NULL AND pd.longitude IS NOT NULL
      AND (p_start_date IS NULL OR pd.datetime::date >= p_start_date)
      AND (p_end_date IS NULL OR pd.datetime::date <= p_end_date)
      AND (
        p_exclude_broker_ids IS NULL
        OR array_length(p_exclude_broker_ids, 1) IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = pd.order_id
            AND o.broker_id = ANY(p_exclude_broker_ids)
        )
      )
  )
  SELECT
    MODE() WITHIN GROUP (ORDER BY g.address)::text AS address,
    MODE() WITHIN GROUP (ORDER BY g.city)::text AS city,
    MODE() WITHIN GROUP (ORDER BY g.state)::text AS state,
    MODE() WITHIN GROUP (ORDER BY g.zip_code)::text AS zip_code,
    MODE() WITHIN GROUP (ORDER BY g.company_name)::text AS company_name,
    COUNT(*) FILTER (WHERE g.type = 'pickup') AS pickup_count,
    COUNT(*) FILTER (WHERE g.type = 'delivery') AS delivery_count,
    COUNT(*) AS total_visits
  FROM gridded g
  GROUP BY g.lat_cell, g.lng_cell
  HAVING COUNT(*) >= 2
  ORDER BY total_visits DESC
  LIMIT 500;
$$;