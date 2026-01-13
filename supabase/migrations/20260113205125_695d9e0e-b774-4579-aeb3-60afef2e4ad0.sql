-- Create table to track dispatcher off-duty dates (lost days)
CREATE TABLE public.dispatcher_off_duty_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatcher_id UUID NOT NULL,
  off_duty_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(dispatcher_id, off_duty_date)
);

-- Enable RLS
ALTER TABLE public.dispatcher_off_duty_days ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can view off duty days"
ON public.dispatcher_off_duty_days
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert
CREATE POLICY "Authenticated users can insert off duty days"
ON public.dispatcher_off_duty_days
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete off duty days"
ON public.dispatcher_off_duty_days
FOR DELETE
TO authenticated
USING (true);

-- Create index for efficient queries by dispatcher and date range
CREATE INDEX idx_dispatcher_off_duty_days_dispatcher_date 
ON public.dispatcher_off_duty_days(dispatcher_id, off_duty_date);