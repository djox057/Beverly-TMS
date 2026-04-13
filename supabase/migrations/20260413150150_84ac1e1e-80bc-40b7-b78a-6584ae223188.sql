ALTER TABLE public.roadside_inspections DROP COLUMN IF EXISTS dot;
ALTER TABLE public.roadside_inspections ADD COLUMN location text;