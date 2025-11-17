-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Dispatch and higher can create recovery history" ON recovery_history;

-- Allow dispatch, afterhours, managers, admins, accounting and supervisors to insert recovery history
CREATE POLICY "Dispatch and higher can create recovery history"
ON recovery_history
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);