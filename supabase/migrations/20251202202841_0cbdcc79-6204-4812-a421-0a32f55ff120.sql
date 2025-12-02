-- Create table for tracking paid weeks per truck/driver/week combination
CREATE TABLE public.trips_paid_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  week_start TEXT NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  marked_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(truck_number, driver_name, week_start)
);

-- Enable RLS
ALTER TABLE public.trips_paid_status ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view paid status
CREATE POLICY "Authenticated users can view paid status"
ON public.trips_paid_status
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Allow all authenticated users to insert paid status
CREATE POLICY "Authenticated users can insert paid status"
ON public.trips_paid_status
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow all authenticated users to update paid status
CREATE POLICY "Authenticated users can update paid status"
ON public.trips_paid_status
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Allow all authenticated users to delete paid status
CREATE POLICY "Authenticated users can delete paid status"
ON public.trips_paid_status
FOR DELETE
USING (auth.uid() IS NOT NULL);