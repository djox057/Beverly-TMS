-- Reuse the existing dispatcher role + profile Recovery tag check.
-- These grants only cover company test checks for recovery drivers.
CREATE POLICY "Recovery dispatchers can add recovery company drug tests"
  ON public.recovery_driver_drug_test_companies FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_recovery_dispatcher())
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = recovery_driver_drug_test_companies.driver_id
        AND d.is_recovery IS TRUE
    )
  );

CREATE POLICY "Recovery dispatchers can update recovery company drug tests"
  ON public.recovery_driver_drug_test_companies FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_recovery_dispatcher())
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = recovery_driver_drug_test_companies.driver_id
        AND d.is_recovery IS TRUE
    )
  )
  WITH CHECK (
    (SELECT public.is_recovery_dispatcher())
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = recovery_driver_drug_test_companies.driver_id
        AND d.is_recovery IS TRUE
    )
  );
