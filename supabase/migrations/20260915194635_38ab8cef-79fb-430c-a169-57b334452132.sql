GRANT SELECT, INSERT, UPDATE, DELETE ON public.upcoming_drivers TO authenticated;
GRANT ALL ON public.upcoming_drivers TO service_role;
GRANT SELECT, INSERT ON public.upcoming_driver_history TO authenticated;
GRANT ALL ON public.upcoming_driver_history TO service_role;