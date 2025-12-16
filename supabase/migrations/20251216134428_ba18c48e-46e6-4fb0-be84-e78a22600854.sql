-- Create order_transfers table to store multiple transfer segments per order
CREATE TABLE public.order_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sequence_number INT NOT NULL DEFAULT 0,  -- 0 = original, 1 = first transfer, 2+ = subsequent transfers
  
  -- Driver/Truck/Trailer for this segment
  driver1_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  driver2_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  trailer_id UUID REFERENCES public.trailers(id) ON DELETE SET NULL,
  
  -- Miles and pay for this segment
  miles NUMERIC,
  driver_price NUMERIC,
  
  -- For manual entry when original was N/A
  manual_driver_name TEXT,
  manual_truck_number TEXT,
  manual_trailer_number TEXT,
  
  -- Metadata
  transfer_date TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique sequence per order
  UNIQUE(order_id, sequence_number)
);

-- Enable RLS
ALTER TABLE public.order_transfers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Dispatch and higher can view order_transfers"
ON public.order_transfers
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

CREATE POLICY "Chicago Management can view order_transfers"
ON public.order_transfers
FOR SELECT
USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

CREATE POLICY "Dispatch and higher can insert order_transfers"
ON public.order_transfers
FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

CREATE POLICY "Dispatch and higher can update order_transfers"
ON public.order_transfers
FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

CREATE POLICY "Managers and admins can delete order_transfers"
ON public.order_transfers
FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Create index for fast lookups by order_id
CREATE INDEX idx_order_transfers_order_id ON public.order_transfers(order_id);

-- Create trigger for updated_at
CREATE TRIGGER update_order_transfers_updated_at
BEFORE UPDATE ON public.order_transfers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();