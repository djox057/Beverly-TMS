-- Override broad schema default grants for the new supplementary log.
REVOKE ALL ON public.truck_service_log_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.truck_service_log_entries TO authenticated;
