-- Create a table to store driver name mappings for fuel transactions
CREATE TABLE public.fuel_driver_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fuel_driver_name text NOT NULL UNIQUE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable Row Level Security
ALTER TABLE public.fuel_driver_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Dispatch and higher can view fuel driver mappings" 
ON public.fuel_driver_mappings 
FOR SELECT 
USING (
  has_role(( SELECT auth.uid() AS uid), 'dispatch'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'afterhours'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'accounting'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'supervisor'::app_role)
);

CREATE POLICY "Managers, admins and accounting can insert fuel driver mappings" 
ON public.fuel_driver_mappings 
FOR INSERT 
WITH CHECK (
  has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'accounting'::app_role)
);

CREATE POLICY "Managers, admins and accounting can update fuel driver mappings" 
ON public.fuel_driver_mappings 
FOR UPDATE 
USING (
  has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'accounting'::app_role)
);

CREATE POLICY "Managers, admins and accounting can delete fuel driver mappings" 
ON public.fuel_driver_mappings 
FOR DELETE 
USING (
  has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR 
  has_role(( SELECT auth.uid() AS uid), 'accounting'::app_role)
);

-- Create trigger for updating updated_at
CREATE TRIGGER update_fuel_driver_mappings_updated_at
BEFORE UPDATE ON public.fuel_driver_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();