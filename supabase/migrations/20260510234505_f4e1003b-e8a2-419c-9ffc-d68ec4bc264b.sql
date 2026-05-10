DROP POLICY IF EXISTS "Accounting roles can update EFS other requests" ON public.efs_other_requests;

CREATE POLICY "Privileged roles can update EFS other requests"
ON public.efs_other_requests
FOR UPDATE
TO authenticated
USING (public.has_any_role(ARRAY['accounting','admin','manager','afterhours','dispatch']::app_role[]))
WITH CHECK (public.has_any_role(ARRAY['accounting','admin','manager','afterhours','dispatch']::app_role[]));