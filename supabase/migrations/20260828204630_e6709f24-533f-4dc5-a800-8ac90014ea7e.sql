CREATE TABLE public.company_coi_vins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  vin text NOT NULL,
  coi_file_id uuid REFERENCES public.company_coi_files(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_name, vin)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_coi_vins TO authenticated;
GRANT ALL ON public.company_coi_vins TO service_role;

ALTER TABLE public.company_coi_vins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view COI VINs"
  ON public.company_coi_vins FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert COI VINs"
  ON public.company_coi_vins FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update COI VINs"
  ON public.company_coi_vins FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete COI VINs"
  ON public.company_coi_vins FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_company_coi_vins_updated_at
  BEFORE UPDATE ON public.company_coi_vins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_company_coi_vins_vin ON public.company_coi_vins (vin);