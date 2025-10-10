-- Drop the existing combined policy for viewing orders
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view orders" ON orders;

-- Create separate policy for managers, admins, accounting, safety, and supervisors (can see all orders)
CREATE POLICY "Managers, admins, accounting, safety and supervisors can view all orders"
ON orders
FOR SELECT
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- Create policy for dispatchers (can only see their own orders)
CREATE POLICY "Dispatchers can only view their own orders"
ON orders
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) AND
  booked_by = (SELECT full_name FROM profiles WHERE user_id = auth.uid())
);