-- Cache supervisor status and assigned-team lookups once per statement.
ALTER POLICY "Supervisor assigned team only" ON public.orders
USING (NOT (SELECT public.is_supervisor_dispatch_user())
  OR booked_by IN (
    SELECT unnest(public.supervisor_team_user_ids())::text
    UNION ALL
    SELECT full_name FROM public.profiles
      WHERE user_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[])
  )
  OR driver1_id IN (SELECT id FROM public.drivers WHERE dispatcher_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[]))
  OR driver2_id IN (SELECT id FROM public.drivers WHERE dispatcher_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[]))
  OR original_driver1_id IN (SELECT id FROM public.drivers WHERE dispatcher_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[]))
  OR original_driver2_id IN (SELECT id FROM public.drivers WHERE dispatcher_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[])))
WITH CHECK (NOT (SELECT public.is_supervisor_dispatch_user())
  OR booked_by IN (
    SELECT unnest(public.supervisor_team_user_ids())::text
    UNION ALL
    SELECT full_name FROM public.profiles
      WHERE user_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[])
  )
  OR driver1_id IN (SELECT id FROM public.drivers WHERE dispatcher_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[]))
  OR driver2_id IN (SELECT id FROM public.drivers WHERE dispatcher_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[]))
  OR original_driver1_id IN (SELECT id FROM public.drivers WHERE dispatcher_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[]))
  OR original_driver2_id IN (SELECT id FROM public.drivers WHERE dispatcher_id = ANY ((SELECT public.supervisor_team_user_ids())::uuid[])));

