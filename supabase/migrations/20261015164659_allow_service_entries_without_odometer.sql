-- A dated manual entry can be recorded before its odometer is available.
ALTER TABLE public.truck_service_log_entries DROP CONSTRAINT truck_service_log_entries_check;
ALTER TABLE public.truck_service_log_entries ADD CONSTRAINT truck_service_log_entries_check CHECK (source_key IS NOT NULL OR log_date IS NOT NULL);
