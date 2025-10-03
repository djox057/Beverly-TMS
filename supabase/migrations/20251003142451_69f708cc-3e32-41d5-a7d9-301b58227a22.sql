-- Drop policies that depend on driver2_id
DROP POLICY IF EXISTS "Drivers can view their assigned trucks" ON public.trucks;
DROP POLICY IF EXISTS "Drivers can view trailers on their trucks" ON public.trailers;
DROP POLICY IF EXISTS "Drivers can view their company" ON public.companies;

-- Remove driver2_id from trucks table
ALTER TABLE public.trucks DROP COLUMN IF EXISTS driver2_id;

-- Update orders to remove driver2_id references
UPDATE public.orders SET driver2_id = NULL WHERE driver2_id IS NOT NULL;

-- Recreate the policies without driver2_id (1 driver per truck model)
CREATE POLICY "Drivers can view their assigned trucks" 
ON public.trucks 
FOR SELECT 
USING (
  driver1_id IN (
    SELECT d.id
    FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
  )
);

CREATE POLICY "Drivers can view trailers on their trucks" 
ON public.trailers 
FOR SELECT 
USING (
  id IN (
    SELECT trucks.trailer_id
    FROM trucks
    WHERE trucks.driver1_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
    )
  )
);

CREATE POLICY "Drivers can view their company" 
ON public.companies 
FOR SELECT 
USING (
  id IN (
    SELECT trucks.company_id
    FROM trucks
    WHERE trucks.driver1_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
    )
  )
);