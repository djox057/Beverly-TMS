-- Add exported status tracking for trips/loads
CREATE TABLE IF NOT EXISTS public.exported_weeks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  exported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  exported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(week_start_date, week_end_date)
);

-- Enable RLS
ALTER TABLE public.exported_weeks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view exported weeks"
ON public.exported_weeks
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch') OR
  has_role(auth.uid(), 'afterhours') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'accounting') OR
  has_role(auth.uid(), 'supervisor') OR
  has_role(auth.uid(), 'chicago_management')
);

CREATE POLICY "Authenticated users can insert exported weeks"
ON public.exported_weeks
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'dispatch') OR
  has_role(auth.uid(), 'afterhours') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'accounting') OR
  has_role(auth.uid(), 'supervisor') OR
  has_role(auth.uid(), 'chicago_management')
);

-- Create index for faster lookups
CREATE INDEX idx_exported_weeks_dates ON public.exported_weeks(week_start_date, week_end_date);