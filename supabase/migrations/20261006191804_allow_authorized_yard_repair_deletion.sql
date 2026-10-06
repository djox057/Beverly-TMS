CREATE POLICY "Maintenance deletes yard repair tasks"
ON public.mandatory_yard_repairs
FOR DELETE TO authenticated
USING ((SELECT public.has_any_role(ARRAY['admin'::public.app_role, 'manager'::public.app_role, 'maintenance'::public.app_role])));
