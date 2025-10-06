-- Add locked column to orders table
ALTER TABLE public.orders 
ADD COLUMN locked boolean NOT NULL DEFAULT false;

-- Drop the existing broad update policy for authenticated users
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;

-- Create specific update policies based on roles and lock status
CREATE POLICY "Dispatch can update unlocked orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) AND locked = false
)
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) AND locked = false
);

CREATE POLICY "Safety can update unlocked orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'safety'::app_role) AND locked = false
)
WITH CHECK (
  has_role(auth.uid(), 'safety'::app_role) AND locked = false
);

CREATE POLICY "Managers and admins can update all orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);