GRANT SELECT, INSERT, UPDATE, DELETE ON public.afterhours_shift_schedule TO authenticated;
GRANT ALL ON public.afterhours_shift_schedule TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.afterhours_shift_assignments TO authenticated;
GRANT ALL ON public.afterhours_shift_assignments TO service_role;