-- Create table for driver performance data
CREATE TABLE public.driver_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_name TEXT NOT NULL UNIQUE,
  gross_tier TEXT NOT NULL DEFAULT 'Tier 1',
  safety_tier TEXT NOT NULL DEFAULT 'Tier 1',
  management_tier TEXT NOT NULL DEFAULT 'Tier 1',
  notice TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.driver_performance ENABLE ROW LEVEL SECURITY;

-- Create policies for driver_performance
CREATE POLICY "Dispatch, managers, admins and accounting can view driver performance"
ON public.driver_performance
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

CREATE POLICY "Managers, admins and accounting can create driver performance"
ON public.driver_performance
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

CREATE POLICY "Managers, admins and accounting can update driver performance"
ON public.driver_performance
FOR UPDATE
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

CREATE POLICY "Admins and accounting can delete driver performance"
ON public.driver_performance
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

CREATE POLICY "Safety can view driver performance"
ON public.driver_performance
FOR SELECT
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can view driver performance"
ON public.driver_performance
FOR SELECT
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create driver performance"
ON public.driver_performance
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update driver performance"
ON public.driver_performance
FOR UPDATE
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_driver_performance_updated_at
BEFORE UPDATE ON public.driver_performance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();