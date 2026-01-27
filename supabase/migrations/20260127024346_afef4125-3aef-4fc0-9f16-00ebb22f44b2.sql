-- Drop the existing restrictive UPDATE policy for orders
DROP POLICY IF EXISTS "Allow authorized users to update unlocked orders" ON orders;

-- Create a new UPDATE policy that:
-- 1. Allows full updates on unlocked orders for authorized roles
-- 2. Allows updates to ONLY the 'paid' column on locked orders for authorized roles
CREATE POLICY "Allow authorized users to update orders"
ON orders
FOR UPDATE
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);