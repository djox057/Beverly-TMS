-- Add HOS fields to drivers table
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS hos_drive_minutes integer,
ADD COLUMN IF NOT EXISTS hos_shift_minutes integer,
ADD COLUMN IF NOT EXISTS hos_cycle_minutes integer,
ADD COLUMN IF NOT EXISTS hos_status text,
ADD COLUMN IF NOT EXISTS hos_last_updated timestamp with time zone;

-- Add an index for better performance when querying by license_number
CREATE INDEX IF NOT EXISTS idx_drivers_license_number ON public.drivers(license_number);

-- Create a mapping table for driver IDs to Transit Tracking names if needed
-- This helps map between your driver records and Transit Tracking's driver identifiers
CREATE TABLE IF NOT EXISTS public.driver_transit_mapping (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  transit_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(driver_id, transit_name)
);

-- Enable RLS on the mapping table
ALTER TABLE public.driver_transit_mapping ENABLE ROW LEVEL SECURITY;

-- Create policies for the mapping table
CREATE POLICY "Authenticated users can view driver transit mapping" 
ON public.driver_transit_mapping 
FOR SELECT 
USING (true);

CREATE POLICY "Managers and admins can manage driver transit mapping" 
ON public.driver_transit_mapping 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Add trigger for timestamps
CREATE TRIGGER update_driver_transit_mapping_updated_at
BEFORE UPDATE ON public.driver_transit_mapping
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();