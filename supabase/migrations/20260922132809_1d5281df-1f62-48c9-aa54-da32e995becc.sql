ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_afterhours_manager boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.is_afterhours_manager IS 'Afterhours-role flag: allows managing the afterhours shift schedule and afterhours driver assignments.';

CREATE OR REPLACE FUNCTION public.is_afterhours_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.is_afterhours_manager = true
      AND public.has_role(_user_id, 'afterhours'::app_role)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_afterhours_manager(uuid) FROM anon;

DROP POLICY IF EXISTS "Managers can insert afterhours shift schedule" ON public.afterhours_shift_schedule;
CREATE POLICY "Managers can insert afterhours shift schedule" ON public.afterhours_shift_schedule
FOR INSERT TO authenticated
WITH CHECK (has_any_role(ARRAY['admin'::app_role,'manager'::app_role]) OR public.is_schedule_manager(auth.uid()) OR public.is_afterhours_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers can update afterhours shift schedule" ON public.afterhours_shift_schedule;
CREATE POLICY "Managers can update afterhours shift schedule" ON public.afterhours_shift_schedule
FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['admin'::app_role,'manager'::app_role]) OR public.is_schedule_manager(auth.uid()) OR public.is_afterhours_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers can delete afterhours shift schedule" ON public.afterhours_shift_schedule;
CREATE POLICY "Managers can delete afterhours shift schedule" ON public.afterhours_shift_schedule
FOR DELETE TO authenticated
USING (has_any_role(ARRAY['admin'::app_role,'manager'::app_role]) OR public.is_schedule_manager(auth.uid()) OR public.is_afterhours_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers can insert shift assignments" ON public.afterhours_shift_assignments;
CREATE POLICY "Managers can insert shift assignments" ON public.afterhours_shift_assignments
FOR INSERT TO authenticated
WITH CHECK (has_any_role(ARRAY['admin'::app_role,'manager'::app_role]) OR public.is_schedule_manager(auth.uid()) OR public.is_afterhours_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers can update shift assignments" ON public.afterhours_shift_assignments;
CREATE POLICY "Managers can update shift assignments" ON public.afterhours_shift_assignments
FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['admin'::app_role,'manager'::app_role]) OR public.is_schedule_manager(auth.uid()) OR public.is_afterhours_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers can delete shift assignments" ON public.afterhours_shift_assignments;
CREATE POLICY "Managers can delete shift assignments" ON public.afterhours_shift_assignments
FOR DELETE TO authenticated
USING (has_any_role(ARRAY['admin'::app_role,'manager'::app_role]) OR public.is_schedule_manager(auth.uid()) OR public.is_afterhours_manager(auth.uid()));