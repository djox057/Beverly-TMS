
-- Table for storing weekly salary values per driver per Thursday
CREATE TABLE public.driver_weekly_salaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  week_date DATE NOT NULL, -- Always a Thursday
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id, week_date)
);

-- Enable RLS
ALTER TABLE public.driver_weekly_salaries ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write
CREATE POLICY "Authenticated users can view driver salaries"
  ON public.driver_weekly_salaries FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert driver salaries"
  ON public.driver_weekly_salaries FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update driver salaries"
  ON public.driver_weekly_salaries FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete driver salaries"
  ON public.driver_weekly_salaries FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Auto-update timestamp
CREATE TRIGGER update_driver_weekly_salaries_updated_at
  BEFORE UPDATE ON public.driver_weekly_salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_driver_weekly_salaries_driver_id ON public.driver_weekly_salaries(driver_id);
CREATE INDEX idx_driver_weekly_salaries_week_date ON public.driver_weekly_salaries(week_date);
