ALTER TABLE public.orders ADD CONSTRAINT prebook_has_no_assignment CHECK (NOT prebook OR (truck_id IS NULL AND trailer_id IS NULL AND driver1_id IS NULL AND driver2_id IS NULL));
