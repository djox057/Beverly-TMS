CREATE TABLE public.user_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  extension text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id),
  UNIQUE (company_id, extension)
);

GRANT SELECT ON public.user_extensions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_extensions TO authenticated;
GRANT ALL ON public.user_extensions TO service_role;

ALTER TABLE public.user_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view user extensions"
ON public.user_extensions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert user extensions"
ON public.user_extensions FOR INSERT TO authenticated
WITH CHECK (public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'manager'));

CREATE POLICY "Admins and managers can update user extensions"
ON public.user_extensions FOR UPDATE TO authenticated
USING (public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'manager'));

CREATE POLICY "Admins and managers can delete user extensions"
ON public.user_extensions FOR DELETE TO authenticated
USING (public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'manager'));

CREATE INDEX idx_user_extensions_user ON public.user_extensions(user_id);
CREATE INDEX idx_user_extensions_extension ON public.user_extensions(extension);

CREATE TRIGGER update_user_extensions_updated_at
BEFORE UPDATE ON public.user_extensions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.user_extensions (user_id, company_id, extension)
SELECT p.user_id, 'f043b212-7f0d-4420-af37-09c79ea68ad4'::uuid, btrim(p.ext)
FROM public.profiles p
WHERE p.ext IS NOT NULL AND btrim(p.ext) <> ''
ON CONFLICT DO NOTHING;