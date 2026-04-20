DROP POLICY IF EXISTS "Roles can view driver_drug_tests" ON public.driver_drug_tests;

CREATE POLICY "Roles can view driver_drug_tests"
ON public.driver_drug_tests
FOR SELECT
USING (has_any_role(ARRAY['safety'::app_role, 'manager'::app_role, 'admin'::app_role, 'maintenance'::app_role, 'chicago_management'::app_role, 'dispatch'::app_role, 'supervisor'::app_role, 'accounting'::app_role]));