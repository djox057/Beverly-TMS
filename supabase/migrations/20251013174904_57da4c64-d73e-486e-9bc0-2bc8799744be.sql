-- Drop the conflicting restrictive policies for pickup_drops INSERT
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can create pickup_dro" ON pickup_drops;
DROP POLICY IF EXISTS "Supervisors can create pickup_drops" ON pickup_drops;

-- Create a single combined INSERT policy that includes all authorized roles
CREATE POLICY "Authorized roles can create pickup_drops"
ON pickup_drops
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);