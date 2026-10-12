-- Persist service-log deletions, including rows projected from live mileage history.
-- Existing INSERT/UPDATE RLS policies continue to enforce truck and entry-type access.
ALTER TABLE public.truck_service_log_entries
  ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
