-- Create recovery_history table to track recovery operations
CREATE TABLE IF NOT EXISTS public.recovery_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- Original assignment data
  original_driver1_id UUID REFERENCES public.drivers(id),
  original_driver2_id UUID REFERENCES public.drivers(id),
  original_truck_id UUID REFERENCES public.trucks(id),
  original_trailer_id UUID REFERENCES public.trailers(id),
  original_dispatcher_id UUID REFERENCES public.profiles(user_id),
  
  -- Recovery assignment data
  recovery_driver1_id UUID REFERENCES public.drivers(id),
  recovery_driver2_id UUID REFERENCES public.drivers(id),
  recovery_truck_id UUID REFERENCES public.trucks(id),
  recovery_trailer_id UUID REFERENCES public.trailers(id),
  
  -- Recovery metadata
  recovery_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reverted_at TIMESTAMP WITH TIME ZONE,
  reverted_by UUID REFERENCES public.profiles(user_id),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.recovery_history ENABLE ROW LEVEL SECURITY;

-- Policies for recovery_history
CREATE POLICY "Dispatch and higher can view recovery history"
  ON public.recovery_history FOR SELECT
  USING (
    has_role(auth.uid(), 'dispatch'::app_role) OR
    has_role(auth.uid(), 'afterhours'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'accounting'::app_role) OR
    has_role(auth.uid(), 'safety'::app_role)
  );

CREATE POLICY "Managers and supervisors can create recovery history"
  ON public.recovery_history FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers and supervisors can update recovery history"
  ON public.recovery_history FOR UPDATE
  USING (
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Create index for faster lookups
CREATE INDEX idx_recovery_history_order_id ON public.recovery_history(order_id);
CREATE INDEX idx_recovery_history_reverted_at ON public.recovery_history(reverted_at);

-- Create trigger to update updated_at
CREATE TRIGGER update_recovery_history_updated_at
  BEFORE UPDATE ON public.recovery_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();