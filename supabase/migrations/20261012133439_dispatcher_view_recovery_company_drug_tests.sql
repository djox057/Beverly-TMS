-- Dispatchers can read the company checks for recovery drivers they can already see.
-- Existing INSERT, UPDATE and DELETE policies keep editing limited to authorized roles.
CREATE POLICY "Dispatchers can view recovery company drug tests"
  ON public.recovery_driver_drug_test_companies FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'dispatch'::public.app_role))
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = recovery_driver_drug_test_companies.driver_id
        AND d.is_recovery IS TRUE
    )
  );
