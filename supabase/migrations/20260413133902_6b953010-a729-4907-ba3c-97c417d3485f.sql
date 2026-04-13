
CREATE TABLE public.roadside_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  dispatcher_id UUID,
  maintenance_check DATE,
  reason TEXT,
  inspection_level SMALLINT CHECK (inspection_level IS NULL OR inspection_level IN (1, 2, 3)),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.roadside_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view roadside inspections"
  ON public.roadside_inspections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert roadside inspections"
  ON public.roadside_inspections FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update roadside inspections"
  ON public.roadside_inspections FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete roadside inspections"
  ON public.roadside_inspections FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_roadside_inspections_updated_at
  BEFORE UPDATE ON public.roadside_inspections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
