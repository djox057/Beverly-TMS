-- Create table to track sick days used by dispatchers
CREATE TABLE public.dispatcher_sick_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sick_date DATE NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(user_id, sick_date)
);

-- Enable RLS
ALTER TABLE public.dispatcher_sick_days ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Authenticated users can view sick days" 
ON public.dispatcher_sick_days 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert sick days" 
ON public.dispatcher_sick_days 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete sick days" 
ON public.dispatcher_sick_days 
FOR DELETE 
TO authenticated
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_dispatcher_sick_days_user_year ON public.dispatcher_sick_days(user_id, year);