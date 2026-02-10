
-- Update SELECT policy to include chicago_management
DROP POLICY "Admin, managers, and accounting can view salary payments" ON public.dispatcher_salary_payments;
CREATE POLICY "Admin, managers, and accounting can view salary payments"
ON public.dispatcher_salary_payments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'chicago_management'::app_role])
));

-- Update INSERT policy to include chicago_management
DROP POLICY "Admin, managers, and accounting can insert salary payments" ON public.dispatcher_salary_payments;
CREATE POLICY "Admin, managers, and accounting can insert salary payments"
ON public.dispatcher_salary_payments FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'chicago_management'::app_role])
));

-- Update UPDATE policy to include chicago_management
DROP POLICY "Admin, managers, and accounting can update salary payments" ON public.dispatcher_salary_payments;
CREATE POLICY "Admin, managers, and accounting can update salary payments"
ON public.dispatcher_salary_payments FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'chicago_management'::app_role])
));

-- Update DELETE policy to include chicago_management
DROP POLICY "Admin, managers, and accounting can delete salary payments" ON public.dispatcher_salary_payments;
CREATE POLICY "Admin, managers, and accounting can delete salary payments"
ON public.dispatcher_salary_payments FOR DELETE
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'chicago_management'::app_role])
));
