-- Add RLS policy to allow yard role to view yard loads (orders with no driver and no truck assigned)
CREATE POLICY "Yard role can view yard loads"
ON public.orders
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'yard'::app_role) 
  AND driver1_id IS NULL 
  AND truck_id IS NULL
);