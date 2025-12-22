-- Create table for EFS other requests (not cash advance)
CREATE TABLE public.efs_other_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES public.drivers(id),
  driver_name TEXT NOT NULL,
  truck_number TEXT,
  company_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL,
  requested_by TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.efs_other_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view EFS other requests" 
ON public.efs_other_requests 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create EFS other requests" 
ON public.efs_other_requests 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Create index for efficient querying by driver
CREATE INDEX idx_efs_other_requests_driver_id ON public.efs_other_requests(driver_id);
CREATE INDEX idx_efs_other_requests_requested_at ON public.efs_other_requests(requested_at DESC);