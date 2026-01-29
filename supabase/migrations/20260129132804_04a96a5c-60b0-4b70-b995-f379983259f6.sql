-- Create weekly_plans table for storing driver weekly plans
CREATE TABLE public.weekly_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  week_start DATE NOT NULL, -- Monday of the week (used to identify which week)
  plan_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(driver_id, week_start)
);

-- Enable Row Level Security
ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for access (all authenticated users can view)
CREATE POLICY "Authenticated users can view weekly plans" 
ON public.weekly_plans 
FOR SELECT 
TO authenticated
USING (true);

-- Users can create weekly plans
CREATE POLICY "Authenticated users can create weekly plans" 
ON public.weekly_plans 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Users can update weekly plans (time restriction handled in application)
CREATE POLICY "Authenticated users can update weekly plans" 
ON public.weekly_plans 
FOR UPDATE 
TO authenticated
USING (true);

-- Users can delete weekly plans (for auto-clear on Monday morning)
CREATE POLICY "Authenticated users can delete weekly plans" 
ON public.weekly_plans 
FOR DELETE 
TO authenticated
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_weekly_plans_updated_at
BEFORE UPDATE ON public.weekly_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_weekly_plans_driver_week ON public.weekly_plans(driver_id, week_start);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_plans;