CREATE TABLE public.afterhours_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  afterhours_user_id uuid NOT NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('night','morning')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT afterhours_shift_assignments_unique UNIQUE (afterhours_user_id, driver_id, scheduled_date, shift)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.afterhours_shift_assignments TO authenticated;
GRANT ALL ON public.afterhours_shift_assignments TO service_role;

ALTER TABLE public.afterhours_shift_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view shift assignments"
ON public.afterhours_shift_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert shift assignments"
ON public.afterhours_shift_assignments FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin','manager']::app_role[]) OR public.is_schedule_manager(auth.uid()));

CREATE POLICY "Managers can update shift assignments"
ON public.afterhours_shift_assignments FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]) OR public.is_schedule_manager(auth.uid()));

CREATE POLICY "Managers can delete shift assignments"
ON public.afterhours_shift_assignments FOR DELETE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]) OR public.is_schedule_manager(auth.uid()));

CREATE INDEX idx_afterhours_shift_assignments_date ON public.afterhours_shift_assignments (scheduled_date, shift);

CREATE TRIGGER update_afterhours_shift_assignments_updated_at
BEFORE UPDATE ON public.afterhours_shift_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();