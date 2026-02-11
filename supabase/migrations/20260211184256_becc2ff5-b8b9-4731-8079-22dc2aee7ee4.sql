
-- 1. Create dispatcher_daily_empty_days snapshot table
CREATE TABLE public.dispatcher_daily_empty_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL REFERENCES public.profiles(user_id),
  office text NOT NULL,
  date date NOT NULL,
  empty_day_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(dispatcher_id, date)
);

-- Index for range queries by date and office
CREATE INDEX idx_dispatcher_daily_empty_days_date_office ON public.dispatcher_daily_empty_days(date, office);

-- Enable RLS
ALTER TABLE public.dispatcher_daily_empty_days ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read empty days"
  ON public.dispatcher_daily_empty_days
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Allow service role inserts (edge function uses service role key)
CREATE POLICY "Service role can insert empty days"
  ON public.dispatcher_daily_empty_days
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update empty days"
  ON public.dispatcher_daily_empty_days
  FOR UPDATE
  USING (true);

-- 2. Replace calculate_empty_days_by_dispatcher RPC with team counting + 6pm rule
CREATE OR REPLACE FUNCTION public.calculate_empty_days_by_dispatcher(p_start_date date, p_end_date date, p_office text DEFAULT NULL::text)
 RETURNS TABLE(dispatcher_id uuid, office text, empty_day_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH truck_dates AS (
    -- Generate per-truck rows instead of per-driver to avoid team double-counting
    SELECT t.id AS truck_id,
           COALESCE(d1.dispatcher_id, d2.dispatcher_id) AS dispatcher_id,
           p2.office::text AS office,
           t.driver1_id,
           t.driver2_id,
           dt::date AS target_date
    FROM trucks t
    LEFT JOIN drivers d1 ON d1.id = t.driver1_id AND d1.is_active = true
    LEFT JOIN drivers d2 ON d2.id = t.driver2_id AND d2.is_active = true
    JOIN profiles p2 ON p2.user_id = COALESCE(d1.dispatcher_id, d2.dispatcher_id)
    CROSS JOIN generate_series(p_start_date::timestamp, p_end_date::timestamp, '1 day'::interval) AS dt
    WHERE (d1.id IS NOT NULL OR d2.id IS NOT NULL)
      AND COALESCE(d1.dispatcher_id, d2.dispatcher_id) IS NOT NULL
      AND p2.office IS NOT NULL
      AND (p_office IS NULL OR p2.office::text = p_office)
  ),
  driver_orders AS (
    -- All driver orders with effective delivery date
    -- 6pm rule: if delivery_end_datetime time >= 18:00, extend transit to cover delivery day
    -- Times are stored as Chicago time in UTC offset
    SELECT o.driver1_id AS did,
           o.pickup_datetime::date AS pd,
           CASE
             WHEN o.delivery_end_datetime IS NOT NULL
                  AND o.delivery_end_datetime::time >= '18:00:00'
             THEN o.delivery_datetime::date + 1
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
             WHEN o.delivery_end_datetime IS NOT NULL
                  AND o.delivery_end_datetime::time >= '18:00:00'
             THEN o.delivery_datetime::date + 1
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
  empty_trucks AS (
    -- A truck-day is empty when NEITHER driver has a pickup or is in transit
    SELECT td.dispatcher_id, td.office, td.truck_id, td.target_date
    FROM truck_dates td
    WHERE
      -- No driver on this truck has a pickup on this date
      NOT EXISTS (
        SELECT 1 FROM driver_orders o
        WHERE (o.did = td.driver1_id OR o.did = td.driver2_id)
          AND o.pd = td.target_date
      )
      -- No driver on this truck is in transit on this date
      AND NOT EXISTS (
        SELECT 1 FROM driver_orders o
        WHERE (o.did = td.driver1_id OR o.did = td.driver2_id)
          AND o.pd < td.target_date
          AND o.effective_dd > td.target_date
      )
  )
  SELECT et.dispatcher_id, et.office, COUNT(*)::bigint AS empty_day_count
  FROM empty_trucks et
  GROUP BY et.dispatcher_id, et.office;
END;
$function$;
