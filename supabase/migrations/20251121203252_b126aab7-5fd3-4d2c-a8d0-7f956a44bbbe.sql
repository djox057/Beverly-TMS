-- Create table for tracking emails sent to drivers
CREATE TABLE public.driver_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_by UUID REFERENCES auth.users(id),
  email_type TEXT NOT NULL DEFAULT 'load_confirmation',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.driver_email_log ENABLE ROW LEVEL SECURITY;

-- Create policies for driver_email_log
CREATE POLICY "Dispatch and higher can view driver email log"
ON public.driver_email_log
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role) OR
  has_role(auth.uid(), 'chicago_management'::app_role)
);

CREATE POLICY "Dispatch and higher can insert driver email log"
ON public.driver_email_log
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role) OR
  has_role(auth.uid(), 'chicago_management'::app_role)
);

-- Create trigger for updated_at
CREATE TRIGGER update_driver_email_log_updated_at
BEFORE UPDATE ON public.driver_email_log
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_driver_email_log_order_id ON public.driver_email_log(order_id);
CREATE INDEX idx_driver_email_log_driver_id ON public.driver_email_log(driver_id);