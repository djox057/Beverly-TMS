DROP FUNCTION IF EXISTS public.get_facility_visit_counts(date, date, uuid[]);

CREATE OR REPLACE FUNCTION public.get_facility_visit_counts(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_exclude_broker_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(address text, city text, state text, zip_code text, company_name text, pickup_count bigint, delivery_count bigint, total_visits bigint, broker_count bigint, lat_cell numeric, lng_cell numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH gridded AS (
    SELECT pd.*,
      ROUND(pd.latitude::numeric * 10, 1) AS lat_cell,
      ROUND(pd.longitude::numeric * 10, 1) AS lng_cell,
      (SELECT o.broker_id FROM orders o WHERE o.id = pd.order_id) AS broker_id
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
    COUNT(*) AS total_visits,
    COUNT(DISTINCT g.broker_id) AS broker_count,
    g.lat_cell,
    g.lng_cell
  FROM gridded g
  GROUP BY g.lat_cell, g.lng_cell
  HAVING COUNT(*) >= 2
  ORDER BY total_visits DESC
  LIMIT 500;
$function$;

CREATE OR REPLACE FUNCTION public.get_facility_brokers(p_lat_cell numeric, p_lng_cell numeric, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_exclude_broker_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(broker_id uuid, broker_name text, mc_number text, load_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.id, b.name::text, b.mc_number::text, COUNT(DISTINCT pd.order_id) AS load_count
  FROM pickup_drops pd
  JOIN orders o ON o.id = pd.order_id
  LEFT JOIN brokers b ON b.id = o.broker_id
  WHERE pd.latitude IS NOT NULL AND pd.longitude IS NOT NULL
    AND ROUND(pd.latitude::numeric * 10, 1) = p_lat_cell
    AND ROUND(pd.longitude::numeric * 10, 1) = p_lng_cell
    AND (p_start_date IS NULL OR pd.datetime::date >= p_start_date)
    AND (p_end_date IS NULL OR pd.datetime::date <= p_end_date)
    AND (
      p_exclude_broker_ids IS NULL
      OR array_length(p_exclude_broker_ids, 1) IS NULL
      OR o.broker_id IS NULL
      OR NOT (o.broker_id = ANY(p_exclude_broker_ids))
    )
  GROUP BY b.id, b.name, b.mc_number
  ORDER BY load_count DESC
  LIMIT 500;
$function$;

CREATE OR REPLACE FUNCTION public.get_facility_lanes(p_lat_cell numeric, p_lng_cell numeric, p_type text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_exclude_broker_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(order_id uuid, load_number text, broker_name text, origin_city text, origin_state text, destination_city text, destination_state text, pickup_date timestamp with time zone, delivery_date timestamp with time zone, freight_amount numeric, loaded_miles numeric, stop_datetime timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH stops AS (
    SELECT DISTINCT pd.order_id, MIN(pd.datetime) AS stop_datetime
    FROM pickup_drops pd
    JOIN orders o ON o.id = pd.order_id
    WHERE pd.latitude IS NOT NULL AND pd.longitude IS NOT NULL
      AND ROUND(pd.latitude::numeric * 10, 1) = p_lat_cell
      AND ROUND(pd.longitude::numeric * 10, 1) = p_lng_cell
      AND (p_type IS NULL OR pd.type = p_type)
      AND (p_start_date IS NULL OR pd.datetime::date >= p_start_date)
      AND (p_end_date IS NULL OR pd.datetime::date <= p_end_date)
      AND (
        p_exclude_broker_ids IS NULL
        OR array_length(p_exclude_broker_ids, 1) IS NULL
        OR o.broker_id IS NULL
        OR NOT (o.broker_id = ANY(p_exclude_broker_ids))
      )
    GROUP BY pd.order_id
  )
  SELECT
    o.id,
    COALESCE(o.internal_load_number, o.load_number)::text,
    b.name::text,
    (SELECT p.city FROM pickup_drops p WHERE p.order_id = o.id AND p.type = 'pickup' ORDER BY p.sequence_number NULLS LAST, p.datetime LIMIT 1)::text,
    (SELECT p.state FROM pickup_drops p WHERE p.order_id = o.id AND p.type = 'pickup' ORDER BY p.sequence_number NULLS LAST, p.datetime LIMIT 1)::text,
    (SELECT d.city FROM pickup_drops d WHERE d.order_id = o.id AND d.type = 'delivery' ORDER BY d.sequence_number DESC NULLS LAST, d.datetime DESC LIMIT 1)::text,
    (SELECT d.state FROM pickup_drops d WHERE d.order_id = o.id AND d.type = 'delivery' ORDER BY d.sequence_number DESC NULLS LAST, d.datetime DESC LIMIT 1)::text,
    o.pickup_datetime,
    o.delivery_datetime,
    o.freight_amount,
    o.loaded_miles,
    s.stop_datetime
  FROM stops s
  JOIN orders o ON o.id = s.order_id
  LEFT JOIN brokers b ON b.id = o.broker_id
  ORDER BY s.stop_datetime DESC
  LIMIT 1000;
$function$;