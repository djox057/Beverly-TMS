-- Drop overly permissive policies on brokers table
DROP POLICY IF EXISTS "Authenticated users can view brokers" ON public.brokers;
DROP POLICY IF EXISTS "Authenticated users can create brokers" ON public.brokers;
DROP POLICY IF EXISTS "Authenticated users can update brokers" ON public.brokers;

-- Create restricted policies for brokers table
-- Only dispatch, managers and admins can view brokers
CREATE POLICY "Dispatch, managers and admins can view brokers"
ON public.brokers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Only managers and admins can create brokers
CREATE POLICY "Managers and admins can create brokers"
ON public.brokers
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Only managers and admins can update brokers
CREATE POLICY "Managers and admins can update brokers"
ON public.brokers
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);