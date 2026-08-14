CREATE POLICY "Chicago management can view complaints"
ON public.driver_complaints FOR SELECT TO authenticated
USING (has_any_role(ARRAY['chicago_management'::app_role]));

CREATE POLICY "Chicago management can view complaint comments"
ON public.driver_complaint_comments FOR SELECT TO authenticated
USING (has_any_role(ARRAY['chicago_management'::app_role]));