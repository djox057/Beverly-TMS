CREATE TABLE public.pretrip_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  inspection_date date NOT NULL,
  problems text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (truck_id, inspection_date)
);
GRANT SELECT, INSERT, UPDATE ON public.pretrip_problems TO authenticated;
GRANT ALL ON public.pretrip_problems TO service_role;
ALTER TABLE public.pretrip_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pretrip problems read" ON public.pretrip_problems FOR SELECT TO authenticated
USING (has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]));
CREATE POLICY "pretrip problems insert" ON public.pretrip_problems FOR INSERT TO authenticated
WITH CHECK (has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]));
CREATE POLICY "pretrip problems update" ON public.pretrip_problems FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]))
WITH CHECK (has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]));