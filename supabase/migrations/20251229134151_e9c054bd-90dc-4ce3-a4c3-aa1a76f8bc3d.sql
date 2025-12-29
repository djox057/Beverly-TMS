-- Create table to track sent late notifications (prevent duplicate emails)
CREATE TABLE public.late_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stop_type TEXT NOT NULL CHECK (stop_type IN ('pickup', 'delivery')),
  stop_id UUID,
  truck_id UUID REFERENCES public.trucks(id),
  dispatcher_id UUID,
  notified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (order_id, stop_type, stop_id)
);

-- Enable RLS
ALTER TABLE public.late_notifications ENABLE ROW LEVEL SECURITY;

-- Allow insert from edge functions and authenticated users
CREATE POLICY "System can insert late notifications"
ON public.late_notifications
FOR INSERT
WITH CHECK (true);

-- Allow select for dispatch and higher roles
CREATE POLICY "Dispatch and higher can view late notifications"
ON public.late_notifications
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- Allow delete for managers and admins (to clear old notifications)
CREATE POLICY "Managers and admins can delete late notifications"
ON public.late_notifications
FOR DELETE
USING (
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Create index for faster lookups
CREATE INDEX idx_late_notifications_order_stop ON public.late_notifications(order_id, stop_type, stop_id);