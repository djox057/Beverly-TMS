-- Allow all dispatch-related roles to view all cash advances
CREATE POLICY "Dispatch and other roles can view all cash advances"
ON public.driver_cash_advances
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role) OR
  has_role((SELECT auth.uid()), 'chicago_management'::app_role) OR
  has_role((SELECT auth.uid()), 'yard'::app_role)
);