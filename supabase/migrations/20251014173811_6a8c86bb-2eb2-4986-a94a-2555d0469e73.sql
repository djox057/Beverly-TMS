-- Add supervisor and safety roles to companies SELECT policy
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view companies" ON companies;

CREATE POLICY "Authenticated users with roles can view companies"
ON companies
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role) OR
  has_role(auth.uid(), 'safety'::app_role)
);