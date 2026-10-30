-- Operating carriers: booking dropdown eligibility is handled separately.
INSERT INTO public.companies (name)
VALUES ('GD Trucking Solutions LLC'), ('Hart Freight Solutions LLC')
ON CONFLICT (name) DO NOTHING;

-- Keep account passwords out of public source and the general companies query.
-- Actual credentials are provisioned separately, never committed in migrations.
CREATE TABLE public.company_info_credentials (
  company_name text PRIMARY KEY REFERENCES public.companies(name) ON UPDATE CASCADE ON DELETE CASCADE,
  credentials jsonb NOT NULL CHECK (jsonb_typeof(credentials) = 'object')
);
ALTER TABLE public.company_info_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.company_info_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_info_credentials TO authenticated;
GRANT ALL ON public.company_info_credentials TO service_role;

CREATE POLICY "Staff can read company info credentials"
ON public.company_info_credentials FOR SELECT TO authenticated
USING ((SELECT public.has_any_role(ARRAY[
  'dispatch', 'afterhours', 'manager', 'admin', 'accounting', 'supervisor',
  'safety', 'maintenance', 'chicago_management', 'yard', 'recruiting', 'claims'
]::public.app_role[])));
