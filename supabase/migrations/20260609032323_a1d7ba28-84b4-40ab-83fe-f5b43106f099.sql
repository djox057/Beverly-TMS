CREATE OR REPLACE FUNCTION public.get_us_map_state_stats(p_direction text, p_from timestamptz)
RETURNS TABLE(state text, count bigint, freight numeric, loaded_miles numeric, dh_miles numeric)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH chosen AS (
    SELECT DISTINCT ON (pd.order_id)
      pd.order_id,
      UPPER(BTRIM(pd.state)) AS st
    FROM pickup_drops pd
    JOIN orders o ON o.id = pd.order_id
    WHERE o.canceled = false
      AND o.pickup_datetime >= p_from
      AND pd.type = CASE WHEN p_direction = 'inbound' THEN 'delivery' ELSE 'pickup' END
      AND pd.state IS NOT NULL
    ORDER BY pd.order_id,
             CASE WHEN p_direction = 'inbound'
                  THEN -COALESCE(pd.sequence_number, 0)
                  ELSE COALESCE(pd.sequence_number, 0) END
  )
  SELECT c.st AS state,
         COUNT(*)::bigint AS count,
         COALESCE(SUM(o.freight_amount), 0)::numeric AS freight,
         COALESCE(SUM(o.loaded_miles), 0)::numeric AS loaded_miles,
         COALESCE(SUM(o.dh_miles), 0)::numeric AS dh_miles
  FROM chosen c
  JOIN orders o ON o.id = c.order_id
  GROUP BY c.st;
$$;

CREATE OR REPLACE FUNCTION public.get_us_map_city_stats(p_direction text, p_from timestamptz, p_min_loads int DEFAULT 3)
RETURNS TABLE(city text, state text, count bigint, freight numeric, loaded_miles numeric, dh_miles numeric, latitude numeric, longitude numeric)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH chosen AS (
    SELECT DISTINCT ON (pd.order_id)
      pd.order_id,
      UPPER(BTRIM(pd.city)) AS city_key,
      INITCAP(BTRIM(pd.city)) AS city_name,
      UPPER(BTRIM(pd.state)) AS state_key,
      pd.latitude,
      pd.longitude
    FROM pickup_drops pd
    JOIN orders o ON o.id = pd.order_id
    WHERE o.canceled = false
      AND o.pickup_datetime >= p_from
      AND pd.type = CASE WHEN p_direction = 'inbound' THEN 'delivery' ELSE 'pickup' END
      AND pd.city IS NOT NULL
      AND pd.state IS NOT NULL
    ORDER BY pd.order_id,
             CASE WHEN p_direction = 'inbound'
                  THEN -COALESCE(pd.sequence_number, 0)
                  ELSE COALESCE(pd.sequence_number, 0) END
  )
  SELECT
    MAX(c.city_name) AS city,
    c.state_key AS state,
    COUNT(*)::bigint AS count,
    COALESCE(SUM(o.freight_amount), 0)::numeric AS freight,
    COALESCE(SUM(o.loaded_miles), 0)::numeric AS loaded_miles,
    COALESCE(SUM(o.dh_miles), 0)::numeric AS dh_miles,
    AVG(c.latitude)::numeric AS latitude,
    AVG(c.longitude)::numeric AS longitude
  FROM chosen c
  JOIN orders o ON o.id = c.order_id
  GROUP BY c.city_key, c.state_key
  HAVING COUNT(*) >= GREATEST(p_min_loads, 1)
     AND AVG(c.latitude) IS NOT NULL
     AND AVG(c.longitude) IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_us_map_state_stats(text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_us_map_city_stats(text, timestamptz, int) TO authenticated, service_role;