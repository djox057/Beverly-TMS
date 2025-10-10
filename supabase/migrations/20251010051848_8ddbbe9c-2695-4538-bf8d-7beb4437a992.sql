-- Remove overly permissive INSERT policy on truck_locations
-- This prevents authenticated users from inserting fake location data
-- Edge functions using service_role will still be able to insert (bypasses RLS)
DROP POLICY IF EXISTS "System can insert truck locations" ON public.truck_locations;

-- Add a restrictive policy that only allows service role (edge functions) to insert
-- This is more explicit and secure
CREATE POLICY "Only service role can insert truck locations"
ON public.truck_locations
FOR INSERT
TO service_role
WITH CHECK (true);