CREATE POLICY "Admins and managers can delete EFS other requests"
ON public.efs_other_requests
FOR DELETE
USING (
  public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role])
);