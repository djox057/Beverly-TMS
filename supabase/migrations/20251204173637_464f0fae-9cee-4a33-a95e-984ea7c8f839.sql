-- Create yard_loads table for simplified yard load data
CREATE TABLE public.yard_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  trailer_number TEXT,
  internal_load_number INTEGER,
  delivery_date TIMESTAMP WITH TIME ZONE,
  delivery_city TEXT,
  delivery_state TEXT,
  truck_number TEXT,
  driver_name TEXT,
  broker_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.yard_loads ENABLE ROW LEVEL SECURITY;

-- RLS policies for yard_loads
CREATE POLICY "Yard role can view yard loads"
ON public.yard_loads
FOR SELECT
USING (has_role((SELECT auth.uid()), 'yard'::app_role));

CREATE POLICY "Dispatch and higher can view yard loads"
ON public.yard_loads
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

CREATE POLICY "Dispatch and higher can insert yard loads"
ON public.yard_loads
FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

CREATE POLICY "Dispatch and higher can update yard loads"
ON public.yard_loads
FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

CREATE POLICY "Managers and admins can delete yard loads"
ON public.yard_loads
FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Add yard role SELECT policies to existing tables they need access to

-- Trucks: Yard can view
CREATE POLICY "Yard can view trucks"
ON public.trucks
FOR SELECT
USING (has_role((SELECT auth.uid()), 'yard'::app_role));

-- Trailers: Yard can view
CREATE POLICY "Yard can view trailers"
ON public.trailers
FOR SELECT
USING (has_role((SELECT auth.uid()), 'yard'::app_role));

-- Drivers: Yard can view
CREATE POLICY "Yard can view drivers"
ON public.drivers
FOR SELECT
USING (has_role((SELECT auth.uid()), 'yard'::app_role));

-- Driver yard actions: Yard can view
CREATE POLICY "Yard can view driver yard actions"
ON public.driver_yard_actions
FOR SELECT
USING (has_role((SELECT auth.uid()), 'yard'::app_role));

-- Companies: Yard can view (needed for driver/truck display)
CREATE POLICY "Yard can view companies"
ON public.companies
FOR SELECT
USING (has_role((SELECT auth.uid()), 'yard'::app_role));

-- Brokers: Yard can view (needed for yard loads display)
CREATE POLICY "Yard can view brokers"
ON public.brokers
FOR SELECT
USING (has_role((SELECT auth.uid()), 'yard'::app_role));