-- Drop and recreate the INSERT policy to include maintenance role
DROP POLICY "Managers admins accounting can insert driver expenses" ON public.driver_expenses;

CREATE POLICY "Roles can insert driver_expenses"
ON public.driver_expenses
FOR INSERT
TO authenticated
WITH CHECK (
  has_any_role(ARRAY['manager'::app_role, 'admin'::app_role, 'accounting'::app_role, 'maintenance'::app_role])
);
