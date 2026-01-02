-- Create table to store order week overrides
CREATE TABLE public.order_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  original_week_start date NOT NULL,
  target_week_start date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (order_id)
);

-- Enable RLS
ALTER TABLE public.order_week_overrides ENABLE ROW LEVEL SECURITY;

-- Managers, admins, and accounting can view overrides
CREATE POLICY "Managers admins accounting can view week overrides"
ON public.order_week_overrides
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Dispatch and other roles can view overrides
CREATE POLICY "Dispatch and other roles can view week overrides"
ON public.order_week_overrides
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

-- Managers, admins, and accounting can insert overrides
CREATE POLICY "Managers admins accounting can insert week overrides"
ON public.order_week_overrides
FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Managers, admins, and accounting can update overrides
CREATE POLICY "Managers admins accounting can update week overrides"
ON public.order_week_overrides
FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Managers, admins, and accounting can delete overrides
CREATE POLICY "Managers admins accounting can delete week overrides"
ON public.order_week_overrides
FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);