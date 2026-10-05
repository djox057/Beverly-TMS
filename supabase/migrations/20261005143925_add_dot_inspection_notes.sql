ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS dot_inspection_note text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS dot_inspection_note text;
COMMENT ON COLUMN public.trucks.dot_inspection_note IS 'Unit-specific DOT inspection note included in DOT reminder emails.';
COMMENT ON COLUMN public.trailers.dot_inspection_note IS 'Unit-specific DOT inspection note included in DOT reminder emails.';
