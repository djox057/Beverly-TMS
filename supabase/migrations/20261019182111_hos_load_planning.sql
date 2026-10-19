-- Backend-only history: no extra realtime publication or frontend fleet scan.
CREATE TABLE public.driver_hos_state (
  driver_id uuid PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  observed_at timestamptz NOT NULL,
  source_at timestamptz,
  status text,
  drive_minutes integer, shift_minutes integer, break_minutes integer, cycle_minutes integer,
  rest_started_at timestamptz,
  log_timezone text NOT NULL DEFAULT 'America/Chicago'
);
CREATE TABLE public.driver_hos_daily (
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  on_duty_minutes numeric NOT NULL DEFAULT 0 CHECK (on_duty_minutes >= 0),
  observed_minutes numeric NOT NULL DEFAULT 0 CHECK (observed_minutes >= 0),
  missing_minutes numeric NOT NULL DEFAULT 0 CHECK (missing_minutes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, log_date)
);
CREATE INDEX driver_hos_daily_date_idx ON public.driver_hos_daily(log_date);
ALTER TABLE public.driver_hos_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_hos_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_hos_state, public.driver_hos_daily FROM anon, authenticated;
GRANT ALL ON public.driver_hos_state, public.driver_hos_daily TO service_role;

CREATE FUNCTION public.record_hos_observations(observations jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  item jsonb; previous public.driver_hos_state; observed timestamptz; source_time timestamptz;
  from_time timestamptz; to_time timestamptz; boundary timestamptz; day date;
  valid_interval boolean; minutes numeric; rest_start timestamptz; n integer := 0;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(observations) LOOP
    observed := (item->>'observed_at')::timestamptz;
    source_time := (item->>'source_at')::timestamptz;
    -- Invalid numeric clocks are not evidence of duty or off-duty continuity.
    IF EXISTS (SELECT 1 FROM unnest(ARRAY['drive','shift','break','cycle']) k
      WHERE item->>k IS NULL OR (item->>k)::integer < 0) THEN CONTINUE; END IF;
    -- Serialize first observations too, without overlapping workers double-counting.
    PERFORM pg_advisory_xact_lock(hashtextextended(item->>'id', 19419));
    SELECT * INTO previous FROM public.driver_hos_state WHERE driver_id=(item->>'id')::uuid FOR UPDATE;
    IF FOUND AND observed <= previous.observed_at THEN CONTINUE; END IF;
    rest_start := CASE WHEN item->>'status' IN ('OFF','SB') THEN observed END;
    IF previous.driver_id IS NOT NULL THEN
      valid_interval := observed - previous.observed_at <= interval '15 minutes'
        AND previous.truck_id IS NOT DISTINCT FROM (item->>'truck_id')::uuid
        AND previous.status IN ('DRV','ON','OFF','SB')
        AND source_time IS NOT NULL AND previous.source_at IS NOT NULL
        AND observed-source_time BETWEEN interval '-5 minutes' AND interval '20 minutes'
        AND previous.observed_at-previous.source_at BETWEEN interval '-5 minutes' AND interval '20 minutes';
      IF valid_interval AND previous.status IN ('OFF','SB') AND item->>'status' IN ('OFF','SB') THEN
        rest_start := coalesce(previous.rest_started_at,previous.observed_at);
      END IF;
      -- Split at home-terminal log midnight, including 23/25-hour DST days.
      from_time := greatest(previous.observed_at,observed-interval '32 days');
      WHILE from_time < observed LOOP
        day := (from_time AT TIME ZONE previous.log_timezone)::date;
        boundary := ((day+1)::timestamp AT TIME ZONE previous.log_timezone);
        to_time := least(observed,boundary);
        minutes := extract(epoch FROM to_time-from_time)/60;
        INSERT INTO public.driver_hos_daily(driver_id,log_date,on_duty_minutes,observed_minutes,missing_minutes)
        VALUES (previous.driver_id,day,
          CASE WHEN valid_interval AND previous.status IN ('DRV','ON') THEN minutes ELSE 0 END,
          CASE WHEN valid_interval THEN minutes ELSE 0 END,
          CASE WHEN valid_interval THEN 0 ELSE minutes END)
        ON CONFLICT(driver_id,log_date) DO UPDATE SET
          on_duty_minutes=public.driver_hos_daily.on_duty_minutes+excluded.on_duty_minutes,
          observed_minutes=public.driver_hos_daily.observed_minutes+excluded.observed_minutes,
          missing_minutes=public.driver_hos_daily.missing_minutes+excluded.missing_minutes,updated_at=now();
        from_time := to_time;
      END LOOP;
    END IF;
    INSERT INTO public.driver_hos_state(driver_id,truck_id,observed_at,source_at,status,drive_minutes,shift_minutes,break_minutes,cycle_minutes,rest_started_at)
    VALUES ((item->>'id')::uuid,(item->>'truck_id')::uuid,observed,source_time,item->>'status',
      (item->>'drive')::integer,(item->>'shift')::integer,(item->>'break')::integer,(item->>'cycle')::integer,rest_start)
    ON CONFLICT(driver_id) DO UPDATE SET truck_id=excluded.truck_id,observed_at=excluded.observed_at,
      source_at=excluded.source_at,status=excluded.status,drive_minutes=excluded.drive_minutes,
      shift_minutes=excluded.shift_minutes,break_minutes=excluded.break_minutes,cycle_minutes=excluded.cycle_minutes,
      rest_started_at=excluded.rest_started_at;
    n := n+1;
  END LOOP;
  DELETE FROM public.driver_hos_daily WHERE log_date < current_date-32;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.record_hos_observations(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_hos_observations(jsonb) TO service_role;

CREATE TABLE public.hos_order_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  actor_id uuid,
  dispatcher_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','done','failed')),
  assessment jsonb,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  recipient_user_id uuid,
  provider_message_id text,
  last_error text,
  UNIQUE(order_id,driver_id)
);
CREATE INDEX hos_order_checks_pending_idx ON public.hos_order_checks(available_at) WHERE status IN ('pending','retry','processing');
ALTER TABLE public.hos_order_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hos_order_checks FROM anon,authenticated;
GRANT ALL ON public.hos_order_checks TO service_role;
CREATE SCHEMA IF NOT EXISTS private;
CREATE FUNCTION private.enqueue_hos_order_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.driver1_id IS NULL OR coalesce(NEW.canceled,false) OR NEW.status='delivered' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.driver1_id IS NOT DISTINCT FROM OLD.driver1_id THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.hos_order_checks(order_id,driver_id,actor_id,dispatcher_id)
  SELECT NEW.id,NEW.driver1_id,auth.uid(),d.dispatcher_id FROM public.drivers d WHERE d.id=NEW.driver1_id
  ON CONFLICT(order_id,driver_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enqueue_hos_order_check() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enqueue_hos_new_order AFTER INSERT OR UPDATE OF driver1_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.enqueue_hos_order_check();

CREATE FUNCTION public.claim_hos_order_checks(target_order uuid DEFAULT NULL)
RETURNS SETOF public.hos_order_checks LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.hos_order_checks SET status='failed',last_error='Alert retry window expired; manual review required.',updated_at=now()
  WHERE status IN ('pending','retry','processing') AND (created_at<=now()-interval '23 hours' OR attempts>=10);
  RETURN QUERY
  UPDATE public.hos_order_checks c SET status='processing',attempts=c.attempts+1,updated_at=now()
  WHERE c.id IN (
    SELECT q.id FROM public.hos_order_checks q
    WHERE (target_order IS NULL OR q.order_id=target_order)
      AND ((q.status IN ('pending','retry') AND (target_order IS NOT NULL OR q.available_at<=now()))
        OR (q.status='processing' AND q.updated_at<now()-interval '5 minutes'))
      AND q.attempts<10 AND q.created_at>now()-interval '23 hours'
    ORDER BY q.available_at LIMIT 10 FOR UPDATE SKIP LOCKED
  ) RETURNING c.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_hos_order_checks(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_hos_order_checks(uuid) TO service_role;
