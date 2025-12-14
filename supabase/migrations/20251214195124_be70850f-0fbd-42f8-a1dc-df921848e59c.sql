-- Create table to track driver cash advance requests
CREATE TABLE public.driver_cash_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC DEFAULT 50 NOT NULL,
  truck_number TEXT,
  requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for efficient queries by driver and date
CREATE INDEX idx_driver_cash_advances_driver_date ON public.driver_cash_advances(driver_id, requested_at);

-- Enable RLS
ALTER TABLE public.driver_cash_advances ENABLE ROW LEVEL SECURITY;

-- Drivers can view their own cash advances
CREATE POLICY "Drivers can view their own cash advances"
ON public.driver_cash_advances
FOR SELECT
USING (
  driver_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  )
);

-- Drivers can insert their own cash advances
CREATE POLICY "Drivers can insert their own cash advances"
ON public.driver_cash_advances
FOR INSERT
WITH CHECK (
  driver_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  )
);

-- Admins, managers, and accounting can view all cash advances
CREATE POLICY "Admins managers accounting can view all cash advances"
ON public.driver_cash_advances
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- System can insert cash advances (for edge function)
CREATE POLICY "System can insert cash advances"
ON public.driver_cash_advances
FOR INSERT
WITH CHECK (true);