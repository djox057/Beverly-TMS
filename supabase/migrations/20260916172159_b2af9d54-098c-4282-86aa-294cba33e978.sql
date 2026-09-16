CREATE TABLE public.afterhours_shift_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scheduled_date date NOT NULL,
  shift text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT afterhours_shift_schedule_shift_check CHECK (shift IN ('night','morning')),
  CONSTRAINT afterhours_shift_schedule_unique UNIQUE (user_id, scheduled_date, shift)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.afterhours_shift_schedule TO authenticated;
GRANT ALL ON public.afterhours_shift_schedule TO service_role;

ALTER TABLE public.afterhours_shift_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view afterhours shift schedule"
ON public.afterhours_shift_schedule FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert afterhours shift schedule"
ON public.afterhours_shift_schedule FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.has_any_role(ARRAY['admin'::app_role,'manager'::app_role]))
  OR (SELECT public.is_schedule_manager((SELECT auth.uid())))
);

CREATE POLICY "Managers can update afterhours shift schedule"
ON public.afterhours_shift_schedule FOR UPDATE TO authenticated
USING (
  (SELECT public.has_any_role(ARRAY['admin'::app_role,'manager'::app_role]))
  OR (SELECT public.is_schedule_manager((SELECT auth.uid())))
);

CREATE POLICY "Managers can delete afterhours shift schedule"
ON public.afterhours_shift_schedule FOR DELETE TO authenticated
USING (
  (SELECT public.has_any_role(ARRAY['admin'::app_role,'manager'::app_role]))
  OR (SELECT public.is_schedule_manager((SELECT auth.uid())))
);

CREATE INDEX idx_afterhours_shift_schedule_date ON public.afterhours_shift_schedule (scheduled_date DESC);

CREATE TRIGGER update_afterhours_shift_schedule_updated_at
BEFORE UPDATE ON public.afterhours_shift_schedule
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();