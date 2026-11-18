ALTER TABLE public.lost_day_notes
  ADD COLUMN IF NOT EXISTS comment text;
