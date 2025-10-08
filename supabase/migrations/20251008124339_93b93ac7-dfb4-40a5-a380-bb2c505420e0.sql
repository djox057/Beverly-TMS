-- Create table for truck location history
CREATE TABLE IF NOT EXISTS public.truck_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id uuid REFERENCES public.trucks(id) ON DELETE CASCADE,
  truck_number text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  location_timestamp timestamptz NOT NULL,
  samsara_vehicle_id text,
  samsara_vehicle_name text,
  speed numeric,
  heading numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_truck_locations_truck_id ON public.truck_locations(truck_id);
CREATE INDEX idx_truck_locations_truck_number ON public.truck_locations(truck_number);
CREATE INDEX idx_truck_locations_timestamp ON public.truck_locations(location_timestamp DESC);

-- Create function to get latest location per truck
CREATE OR REPLACE FUNCTION public.get_latest_truck_locations()
RETURNS TABLE (
  truck_id uuid,
  truck_number text,
  latitude numeric,
  longitude numeric,
  location_timestamp timestamptz,
  samsara_vehicle_id text,
  samsara_vehicle_name text,
  speed numeric,
  heading numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (tl.truck_id)
    tl.truck_id,
    tl.truck_number,
    tl.latitude,
    tl.longitude,
    tl.location_timestamp,
    tl.samsara_vehicle_id,
    tl.samsara_vehicle_name,
    tl.speed,
    tl.heading
  FROM public.truck_locations tl
  ORDER BY tl.truck_id, tl.location_timestamp DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable RLS
ALTER TABLE public.truck_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Dispatch, managers and admins can view truck locations"
  ON public.truck_locations
  FOR SELECT
  USING (
    has_role(auth.uid(), 'dispatch'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Safety can view truck locations"
  ON public.truck_locations
  FOR SELECT
  USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "System can insert truck locations"
  ON public.truck_locations
  FOR INSERT
  WITH CHECK (true);

-- Trigger to update updated_at
CREATE TRIGGER update_truck_locations_updated_at
  BEFORE UPDATE ON public.truck_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();