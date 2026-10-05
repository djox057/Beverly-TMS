ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS dot_inspection_checked boolean NOT NULL DEFAULT false;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS dot_inspection_checked boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.trucks.dot_inspection_checked IS 'When true, suppress this truck in daily and weekly DOT reminder emails until unchecked.';
COMMENT ON COLUMN public.trailers.dot_inspection_checked IS 'When true, suppress this trailer in daily and weekly DOT reminder emails until unchecked.';
