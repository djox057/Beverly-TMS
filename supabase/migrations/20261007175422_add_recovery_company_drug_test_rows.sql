CREATE TABLE public.recovery_driver_drug_test_companies (
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_tested boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, company_id)
);

CREATE INDEX recovery_driver_drug_test_companies_company_idx
  ON public.recovery_driver_drug_test_companies (company_id);

ALTER TABLE public.recovery_driver_drug_test_companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recovery_driver_drug_test_companies FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_driver_drug_test_companies TO authenticated;
GRANT ALL ON public.recovery_driver_drug_test_companies TO service_role;

CREATE POLICY "Authorized roles can view recovery company drug tests"
  ON public.recovery_driver_drug_test_companies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_id AND d.is_recovery IS TRUE
    )
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'safety'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'maintenance'::public.app_role))
    )
  );

CREATE POLICY "Authorized roles can add recovery company drug tests"
  ON public.recovery_driver_drug_test_companies FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_id AND d.is_recovery IS TRUE
    )
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'safety'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'maintenance'::public.app_role))
    )
  );

CREATE POLICY "Authorized roles can update recovery company drug tests"
  ON public.recovery_driver_drug_test_companies FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_id AND d.is_recovery IS TRUE
    )
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'safety'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'maintenance'::public.app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_id AND d.is_recovery IS TRUE
    )
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'safety'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'maintenance'::public.app_role))
    )
  );

CREATE POLICY "Authorized roles can remove recovery company drug tests"
  ON public.recovery_driver_drug_test_companies FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_id AND d.is_recovery IS TRUE
    )
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'safety'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'maintenance'::public.app_role))
    )
  );

CREATE TRIGGER update_recovery_driver_drug_test_companies_updated_at
  BEFORE UPDATE ON public.recovery_driver_drug_test_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.recovery_driver_drug_test_companies (driver_id, company_id)
SELECT d.id, c.id
FROM public.drivers d
CROSS JOIN public.companies c
WHERE d.is_recovery IS TRUE
ON CONFLICT (driver_id, company_id) DO NOTHING;
