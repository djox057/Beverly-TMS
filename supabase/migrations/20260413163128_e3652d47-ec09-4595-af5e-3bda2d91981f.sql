ALTER TABLE public.roadside_inspections
  ADD COLUMN yard_check_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN road_check_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN yard_check_approved_by text,
  ADD COLUMN road_check_approved_by text;