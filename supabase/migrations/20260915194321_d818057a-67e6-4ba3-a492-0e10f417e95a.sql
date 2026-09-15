-- The AFTER trigger on upcoming_drivers inserts into upcoming_driver_history as the
-- invoking user, so the table needs an INSERT policy. Without it every save fails.
CREATE POLICY "upcoming_driver_history_insert"
ON public.upcoming_driver_history
FOR INSERT TO authenticated
WITH CHECK ((SELECT upcoming_drivers_private.primary_role()) = ANY (ARRAY['admin','manager','supervisor','safety','recruiting','dispatch']));

GRANT SELECT, INSERT ON public.upcoming_driver_history TO authenticated;
GRANT ALL ON public.upcoming_driver_history TO service_role;