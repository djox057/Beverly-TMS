-- Create table to store original order values before cancellation
CREATE TABLE IF NOT EXISTS public.canceled_orders_backup (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  canceled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  canceled_by UUID REFERENCES auth.users(id),
  
  -- Original values before cancellation
  original_freight_amount NUMERIC,
  original_driver_price NUMERIC,
  original_loaded_miles NUMERIC,
  original_dh_miles NUMERIC,
  original_tonu NUMERIC,
  original_tonu_driver NUMERIC,
  original_notes TEXT,
  
  -- Cancellation values
  cancel_tonu NUMERIC,
  cancel_driver_rate NUMERIC,
  cancel_dh_miles NUMERIC,
  cancel_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.canceled_orders_backup ENABLE ROW LEVEL SECURITY;

-- Policies for viewing canceled order backups
CREATE POLICY "Dispatch and higher can view canceled order backups"
ON public.canceled_orders_backup
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- Policies for creating canceled order backups
CREATE POLICY "Dispatch and higher can create canceled order backups"
ON public.canceled_orders_backup
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- Policies for deleting canceled order backups (when reverting)
CREATE POLICY "Managers, admins and accounting can delete canceled order backups"
ON public.canceled_orders_backup
FOR DELETE
USING (
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

-- Create index for faster lookups
CREATE INDEX idx_canceled_orders_backup_order_id ON public.canceled_orders_backup(order_id);

-- Add trigger for updated_at
CREATE TRIGGER update_canceled_orders_backup_updated_at
BEFORE UPDATE ON public.canceled_orders_backup
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();