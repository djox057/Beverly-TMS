-- Create table to track dispatcher daily driver counts
CREATE TABLE public.dispatcher_daily_driver_counts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatcher_id UUID NOT NULL,
  date DATE NOT NULL,
  driver_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index to prevent duplicate entries for same dispatcher on same date
CREATE UNIQUE INDEX idx_dispatcher_daily_counts ON public.dispatcher_daily_driver_counts(dispatcher_id, date);

-- Enable Row Level Security
ALTER TABLE public.dispatcher_daily_driver_counts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Dispatch and higher can view dispatcher daily counts"
ON public.dispatcher_daily_driver_counts
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "System can insert dispatcher daily counts"
ON public.dispatcher_daily_driver_counts
FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update dispatcher daily counts"
ON public.dispatcher_daily_driver_counts
FOR UPDATE
USING (true);

-- Enable pg_cron and pg_net extensions for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;