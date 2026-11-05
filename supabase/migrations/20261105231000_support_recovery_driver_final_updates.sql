ALTER TABLE public.final_update_sends ALTER COLUMN truck_id DROP NOT NULL;
ALTER TABLE public.final_update_sends ADD CONSTRAINT final_update_sends_has_subject CHECK (truck_id IS NOT NULL OR driver_id IS NOT NULL) NOT VALID;
CREATE UNIQUE INDEX final_update_sends_unassigned_driver_date_key ON public.final_update_sends (driver_id, send_date) WHERE truck_id IS NULL;
