-- Drop the problematic policy with ELSE true
DROP POLICY "Drivers can view their own orders v2" ON orders;

-- Create a fixed policy that only applies to drivers
CREATE POLICY "Drivers can view their own orders v2" ON orders
FOR SELECT
USING (
  has_role(auth.uid(), 'driver'::app_role) 
  AND (driver1_id = (auth.jwt() ->> 'driver_id')::uuid OR driver2_id = (auth.jwt() ->> 'driver_id')::uuid)
);