-- Afterhours sees the full Trips fleet. Dispatch sees its assigned drivers and
-- statements tied to orders visible in its own Trips view.
CREATE POLICY "Dispatch and Afterhours read trip statements" ON public.trip_week_statements
FOR SELECT TO authenticated
USING (
  (SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'afterhours'::public.app_role
  ))
  OR (
    (SELECT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'dispatch'::public.app_role
    ))
    AND (
      EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.dispatcher_id = (SELECT auth.uid())
          AND (
            d.id = trip_week_statements.driver_id
            OR (
              trip_week_statements.driver_id IS NULL
              AND d.name = trip_week_statements.driver_name
              AND NOT EXISTS (
                SELECT 1 FROM public.drivers other WHERE other.name = d.name AND other.id <> d.id
              )
            )
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.orders o
        LEFT JOIN public.order_week_overrides w ON w.order_id = o.id
        WHERE trip_week_statements.week_start = COALESCE(
          w.target_week_start::text,
          (date_trunc('week', (o.delivery_datetime AT TIME ZONE 'UTC') - interval '1 day')::date + 1)::text
        )
          AND (
            trip_week_statements.driver_id IN (o.driver1_id, o.driver2_id, o.original_driver1_id, o.original_driver2_id)
            OR (
              trip_week_statements.driver_id IS NULL
              AND EXISTS (
                SELECT 1 FROM public.trucks t
                WHERE t.id IN (o.truck_id, o.original_truck_id) AND t.truck_number = trip_week_statements.truck_number
              )
              AND EXISTS (
                SELECT 1 FROM public.drivers d
                WHERE d.id IN (o.driver1_id, o.driver2_id, o.original_driver1_id, o.original_driver2_id)
                  AND d.name = trip_week_statements.driver_name
              )
            )
          )
          AND (
            o.booked_by = (SELECT auth.uid())::text
            OR o.booked_by = (SELECT p.full_name FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
            OR EXISTS (
              SELECT 1 FROM public.drivers d
              WHERE d.id IN (o.driver1_id, o.driver2_id, o.original_driver1_id, o.original_driver2_id)
                AND d.dispatcher_id = (SELECT auth.uid())
            )
          )
      )
    )
  )
);

CREATE POLICY "Dispatch and Afterhours read visible trip statement files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'trip-statements'
  AND (SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid()) AND r.role IN ('dispatch'::public.app_role, 'afterhours'::public.app_role)
  ))
  AND EXISTS (SELECT 1 FROM public.trip_week_statements s WHERE s.file_path = objects.name)
);
