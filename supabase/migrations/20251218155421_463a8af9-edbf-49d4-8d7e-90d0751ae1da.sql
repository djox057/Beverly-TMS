-- Allow maintenance role to view user roles
CREATE POLICY "Maintenance can view user roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));