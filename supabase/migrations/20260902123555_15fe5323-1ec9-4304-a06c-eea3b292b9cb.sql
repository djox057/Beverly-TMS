DROP POLICY IF EXISTS "System can insert assignment history" ON public.assignment_history;

CREATE POLICY "Roles can insert assignment history"
ON public.assignment_history
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_any_role(ARRAY['afterhours'::app_role, 'maintenance'::app_role, 'admin'::app_role, 'manager'::app_role, 'accounting'::app_role, 'safety'::app_role, 'supervisor'::app_role])
);