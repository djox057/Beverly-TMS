-- Separate from the legacy badge: every other role keeps its existing behavior.
-- This endpoint derives both identity and fleet ownership on the server and
-- returns only counts plus UUIDs needed to filter the shared realtime stream.
CREATE OR REPLACE FUNCTION public.get_dispatcher_load_opportunities()
RETURNS TABLE (prebook_count integer, recovery_count integer, truck_ids uuid[], order_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  viewer uuid := auth.uid();
BEGIN
  -- Match getPrimaryRole(): inherited dispatch access is not a dispatcher role.
  IF viewer IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = viewer AND r.role = 'dispatch')
    OR EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = viewer
        AND r.role::text = ANY (ARRAY['admin','safety','claims','accounting','manager','supervisor','chicago_management','maintenance'])
    ) THEN
    RETURN QUERY SELECT 0, 0, ARRAY[]::uuid[], ARRAY[]::uuid[];
    RETURN;
  END IF;

  RETURN QUERY
  WITH company_codes AS MATERIALIZED (
    -- Same name normalization/precedence as getCompanySuffix().
    SELECT c.id, CASE
      WHEN lower(btrim(c.name)) LIKE '%lale transport%' THEN 'LT'
      WHEN lower(btrim(c.name)) LIKE '%jones freight%' THEN 'JF'
      WHEN lower(btrim(c.name)) LIKE '%bf prime united%' THEN 'BFU'
      WHEN lower(btrim(c.name)) LIKE '%bf prime%' THEN 'BFP'
      WHEN lower(btrim(c.name)) LIKE '%beverly freight%' THEN 'BF'
      WHEN lower(btrim(c.name)) LIKE '%united enterprise%' THEN 'UE'
      WHEN lower(btrim(c.name)) LIKE '%bg prime%' THEN 'BG'
      WHEN lower(btrim(c.name)) LIKE '%ap silver%' THEN 'AP'
      ELSE '' END AS code
    FROM public.companies c
  ), my_trucks AS MATERIALIZED (
    SELECT t.id, cc.code AS company_code
    FROM public.trucks t
    JOIN public.drivers d ON d.id = t.driver1_id
    LEFT JOIN company_codes cc ON cc.id = t.company_id
    WHERE d.dispatcher_id = viewer AND d.is_active = true AND t.is_active = true
  ), available_orders AS MATERIALIZED (
    SELECT o.id, o.prebook, cc.code AS booking_code
    FROM public.orders o
    LEFT JOIN company_codes cc ON cc.id = o.booked_by_company_id
    WHERE (o.prebook = true OR o.retrieval = true)
      AND o.canceled = false AND coalesce(o.recovery_assigned, false) = false
      AND (o.prebook = false OR (
        coalesce(o.p_status, 'Available') = 'Available'
        AND o.truck_id IS NULL AND o.driver1_id IS NULL AND o.driver2_id IS NULL
      ))
      AND (o.retrieval = false OR o.recovery_auto_cancel_at IS NULL OR o.recovery_auto_cancel_at > now())
      AND NOT EXISTS (
        SELECT 1 FROM public.order_files f WHERE f.order_id = o.id
          AND (f.file_category = 'POD' OR (o.prebook = true AND f.file_category = 'BOL'))
      )
  ), opportunities AS MATERIALIZED (
    SELECT o.*, p.datetime AS pickup_at, p.latitude::double precision AS lat, p.longitude::double precision AS lon
    FROM available_orders o
    CROSS JOIN LATERAL (
      SELECT pd.datetime, pd.end_datetime, pd.latitude, pd.longitude
      FROM public.pickup_drops pd WHERE pd.order_id = o.id AND pd.type = 'pickup'
      ORDER BY pd.sequence_number ASC LIMIT 1
    ) p
    -- Appointment timestamps are stored as wall-clock values in UTC in TMS.
    -- Do not shift their dates to Chicago; only convert the real current time.
    WHERE (coalesce(p.end_datetime, p.datetime) AT TIME ZONE 'UTC') >= (now() AT TIME ZONE 'America/Chicago')
      AND p.latitude BETWEEN -90 AND 90 AND p.longitude BETWEEN -180 AND 180
  ), latest_orders AS MATERIALIZED (
    SELECT o.*, t.id AS matched_truck_id, t.company_code, prev.id AS previous_id,
      prev.delivery_datetime, prev.delivery_end_datetime
    FROM opportunities o
    CROSS JOIN my_trucks t
    LEFT JOIN LATERAL (
      -- Select first, then check delivery. An overlapping newer load must never
      -- fall back to an older nearby delivery. This mirrors suggestedPrebookTrucks.
      SELECT prior.id, prior.delivery_datetime, prior.delivery_end_datetime
      FROM public.orders prior
      WHERE prior.truck_id = t.id AND prior.id <> o.id
        AND prior.canceled = false AND prior.notes IS DISTINCT FROM 'GAME|OVER'
        AND prior.driver1_id IS NOT NULL AND prior.pickup_datetime <= o.pickup_at
      ORDER BY prior.pickup_datetime DESC, prior.id DESC LIMIT 1
    ) prev ON true
  ), deliveries AS MATERIALIZED (
    SELECT l.*, coalesce(pd.end_datetime, l.delivery_end_datetime, pd.datetime, l.delivery_datetime) AS delivery_at,
      pd.latitude::double precision AS delivery_lat, pd.longitude::double precision AS delivery_lon
    FROM latest_orders l
    CROSS JOIN LATERAL (
      SELECT d.datetime, d.end_datetime, d.latitude, d.longitude
      FROM public.pickup_drops d WHERE d.order_id = l.previous_id AND d.type = 'delivery'
      ORDER BY d.sequence_number DESC LIMIT 1
    ) pd
  ), distances AS (
    SELECT d.*, power(sin(radians(d.delivery_lat - d.lat) / 2), 2)
      + cos(radians(d.lat)) * cos(radians(d.delivery_lat))
      * power(sin(radians(d.delivery_lon - d.lon) / 2), 2) AS haversine
    FROM deliveries d
    WHERE d.delivery_at <= d.pickup_at
      AND (d.delivery_at AT TIME ZONE 'UTC')::date = (d.pickup_at AT TIME ZONE 'UTC')::date
      AND d.delivery_lat BETWEEN -90 AND 90 AND d.delivery_lon BETWEEN -180 AND 180
      -- Same restrictions as canAssignPrebookTruck(); recovery has no such rule.
      AND (d.prebook = false OR (
        d.booking_code IS NOT NULL AND CASE d.booking_code
          WHEN 'BFP' THEN coalesce(d.company_code IN ('BFP','AP','UE','JF'), false)
          WHEN 'BF' THEN coalesce(d.company_code = 'BF', false)
          ELSE true END
      ))
  ), matches AS (
    SELECT DISTINCT d.id, d.prebook
    FROM distances d
    -- Same rounded Haversine * 1.3 estimate as Reports trucks nearby.
    -- Strictly under 100: a displayed estimate of 100 does not qualify.
    WHERE round((3959 * 2 * atan2(sqrt(greatest(0, d.haversine)),
      sqrt(greatest(0, 1 - d.haversine))) * 1.3)::numeric) < 100
  )
  SELECT
    (SELECT count(*)::integer FROM matches m WHERE m.prebook = true),
    (SELECT count(*)::integer FROM matches m WHERE m.prebook = false),
    coalesce((SELECT array_agg(t.id ORDER BY t.id) FROM my_trucks t), ARRAY[]::uuid[]),
    ARRAY(SELECT DISTINCT watched.id FROM (
      SELECT a.id FROM available_orders a
      UNION SELECT l.previous_id FROM latest_orders l WHERE l.previous_id IS NOT NULL
    ) watched ORDER BY watched.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dispatcher_load_opportunities() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_dispatcher_load_opportunities() TO authenticated;
