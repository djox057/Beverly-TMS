-- Drop the existing restrictive policy for dispatchers
DROP POLICY IF EXISTS "Dispatchers can only view their own orders" ON public.orders;

-- Create new policy allowing dispatchers to view all orders
CREATE POLICY "Dispatchers can view all orders"
ON public.orders
FOR SELECT
USING (has_role(auth.uid(), 'dispatch'::app_role));