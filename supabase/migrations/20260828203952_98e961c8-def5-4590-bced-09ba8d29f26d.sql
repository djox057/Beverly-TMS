
CREATE TABLE public.company_coi_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  content_type text,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_coi_files TO authenticated;
GRANT ALL ON public.company_coi_files TO service_role;

ALTER TABLE public.company_coi_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view company COI files"
ON public.company_coi_files FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert company COI files"
ON public.company_coi_files FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update company COI files"
ON public.company_coi_files FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete company COI files"
ON public.company_coi_files FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_company_coi_files_company_name ON public.company_coi_files (company_name);

CREATE TRIGGER update_company_coi_files_updated_at
BEFORE UPDATE ON public.company_coi_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated can read company-coi objects"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-coi');

CREATE POLICY "Admins can upload company-coi objects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-coi' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update company-coi objects"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-coi' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete company-coi objects"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-coi' AND public.has_role(auth.uid(), 'admin'));
