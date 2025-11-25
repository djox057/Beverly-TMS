
-- Drop existing policies for driver_yard_actions that need to be updated
DROP POLICY IF EXISTS "Dispatch and higher can view driver yard actions" ON driver_yard_actions;
DROP POLICY IF EXISTS "Managers and admins can update driver yard actions" ON driver_yard_actions;

-- Recreate view policy with maintenance role included
CREATE POLICY "Dispatch and higher can view driver yard actions"
ON driver_yard_actions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role) OR
  has_role(auth.uid(), 'chicago_management'::app_role) OR
  has_role(auth.uid(), 'maintenance'::app_role)
);

-- Recreate update policy with maintenance role included
CREATE POLICY "Managers, admins and maintenance can update driver yard actions"
ON driver_yard_actions
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'maintenance'::app_role)
);
