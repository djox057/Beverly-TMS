CREATE TABLE public.afterhours_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  afterhours_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (afterhours_user_id, driver_id)
);

ALTER TABLE public.afterhours_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read afterhours assignments"
ON public.afterhours_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/manager can insert afterhours assignments"
ON public.afterhours_assignments FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role]));

CREATE POLICY "Admin/manager can update afterhours assignments"
ON public.afterhours_assignments FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role]))
WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role]));

CREATE POLICY "Admin/manager can delete afterhours assignments"
ON public.afterhours_assignments FOR DELETE TO authenticated
USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role]));