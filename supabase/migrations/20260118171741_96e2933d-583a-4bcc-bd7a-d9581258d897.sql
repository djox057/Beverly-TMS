-- Create a table for driver problems
CREATE TABLE public.driver_problems (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.driver_problems ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Users can view all driver problems" 
ON public.driver_problems 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create driver problems" 
ON public.driver_problems 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update driver problems" 
ON public.driver_problems 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete driver problems" 
ON public.driver_problems 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX idx_driver_problems_driver_id ON public.driver_problems(driver_id);
CREATE INDEX idx_driver_problems_resolved_at ON public.driver_problems(resolved_at);