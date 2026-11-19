-- Keep the driver ID as a historical reference even if the fleet record is deleted.
-- Older statements retain their original truck/name/week identity.
ALTER TABLE public.trip_week_statements
  ADD COLUMN driver_id uuid,
  ALTER COLUMN truck_number DROP NOT NULL,
  ADD CONSTRAINT trip_week_statements_has_owner CHECK (driver_id IS NOT NULL OR truck_number IS NOT NULL);

CREATE UNIQUE INDEX trip_week_statements_driver_week_idx
  ON public.trip_week_statements (driver_id, week_start);

-- Driver-linked statements use the visible trips for that pay week, including overrides.
ALTER POLICY "Supervisors read visible trip statements" ON public.trip_week_statements
USING (
  (SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'supervisor'::public.app_role))
  AND EXISTS (
    SELECT 1 FROM public.orders o
    LEFT JOIN public.trucks t ON t.id = o.truck_id
    LEFT JOIN public.order_week_overrides w ON w.order_id = o.id
    JOIN public.drivers d ON d.id IN (o.driver1_id, o.driver2_id, o.original_driver1_id, o.original_driver2_id)
    WHERE (
      (trip_week_statements.driver_id IS NULL
        AND t.truck_number = trip_week_statements.truck_number
        AND d.name = trip_week_statements.driver_name)
      OR (d.id = trip_week_statements.driver_id
        AND trip_week_statements.week_start = COALESCE(
          w.target_week_start::text,
          (date_trunc('week', (o.delivery_datetime AT TIME ZONE 'UTC') - interval '1 day')::date + 1)::text
        ))
    )
    AND (
      o.booked_by IN (SELECT unnest(public.supervisor_team_user_ids())::text)
      OR o.booked_by IN (SELECT full_name FROM public.profiles WHERE user_id = ANY(public.supervisor_team_user_ids()))
      OR EXISTS (
        SELECT 1 FROM public.drivers team_driver
        WHERE team_driver.id IN (o.driver1_id, o.driver2_id, o.original_driver1_id, o.original_driver2_id)
          AND team_driver.dispatcher_id = ANY(public.supervisor_team_user_ids())
      )
    )
  )
);
