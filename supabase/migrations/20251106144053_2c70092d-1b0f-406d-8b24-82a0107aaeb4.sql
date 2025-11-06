-- Update RLS policy for safety role to view all orders
-- This only affects the safety role and no other roles

-- Drop the existing safety SELECT policy
DROP POLICY IF EXISTS "Safety can view orders" ON public.orders;

-- Create a clear policy that allows safety to view ALL orders
-- No restrictions based on who created the order or any other criteria
CREATE POLICY "Safety can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'safety'::app_role));

-- Note: Safety already has access via the combined policy 
-- "Managers, admins, accounting, safety and supervisors can view all orders"
-- but this dedicated policy makes it explicit and clear