ALTER TABLE public.upcoming_driver_history
  DROP CONSTRAINT upcoming_driver_history_upcoming_driver_id_fkey,
  ADD CONSTRAINT upcoming_driver_history_upcoming_driver_id_fkey
    FOREIGN KEY (upcoming_driver_id) REFERENCES public.upcoming_drivers(id) ON DELETE CASCADE;

GRANT DELETE ON public.upcoming_drivers TO authenticated;
GRANT DELETE ON public.upcoming_driver_history TO authenticated;

CREATE POLICY upcoming_drivers_delete ON public.upcoming_drivers
  FOR DELETE TO authenticated
  USING ((SELECT upcoming_drivers_private.primary_role()) = ANY (ARRAY['admin','manager','supervisor','recruiting']));

CREATE POLICY upcoming_driver_history_delete ON public.upcoming_driver_history
  FOR DELETE TO authenticated
  USING ((SELECT upcoming_drivers_private.primary_role()) = ANY (ARRAY['admin','manager','supervisor','recruiting']));