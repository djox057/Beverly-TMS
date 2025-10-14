-- Fix dispatch cancel order permission issue
-- Allow dispatch to update unlocked orders and set them to locked during cancellation
DROP POLICY IF EXISTS "Dispatch can update unlocked orders" ON public.orders;

CREATE POLICY "Dispatch can update unlocked orders" 
ON public.orders 
FOR UPDATE 
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) 
  AND locked = false
)
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role)
  -- Allow setting locked to true during cancellation, but order must start unlocked
);