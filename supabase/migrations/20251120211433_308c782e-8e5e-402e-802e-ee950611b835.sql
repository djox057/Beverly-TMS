-- Create table for driver yard actions
CREATE TABLE public.driver_yard_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('maintenance', 'return_truck')),
  comment text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_yard_actions ENABLE ROW LEVEL SECURITY;

-- Create policies for driver_yard_actions
CREATE POLICY "Dispatch and higher can view driver yard actions"
  ON public.driver_yard_actions
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

CREATE POLICY "Dispatch and higher can create driver yard actions"
  ON public.driver_yard_actions
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

CREATE POLICY "Managers and admins can update driver yard actions"
  ON public.driver_yard_actions
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers and admins can delete driver yard actions"
  ON public.driver_yard_actions
  FOR DELETE
  USING (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Add trigger for updated_at
CREATE TRIGGER update_driver_yard_actions_updated_at
  BEFORE UPDATE ON public.driver_yard_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();