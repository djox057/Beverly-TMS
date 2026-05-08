
-- driver_problems: restrict writes to operational roles (exclude driver)
DROP POLICY IF EXISTS "Authenticated users can create driver problems" ON public.driver_problems;
DROP POLICY IF EXISTS "Authenticated users can update driver problems" ON public.driver_problems;
DROP POLICY IF EXISTS "Authenticated users can delete driver problems" ON public.driver_problems;

CREATE POLICY "Operational roles can create driver problems"
ON public.driver_problems FOR INSERT TO authenticated
WITH CHECK (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[]));

CREATE POLICY "Operational roles can update driver problems"
ON public.driver_problems FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[]))
WITH CHECK (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[]));

CREATE POLICY "Operational roles can delete driver problems"
ON public.driver_problems FOR DELETE TO authenticated
USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[]));

-- weekly_plans: restrict writes to operational roles
DROP POLICY IF EXISTS "Authenticated users can create weekly plans" ON public.weekly_plans;
DROP POLICY IF EXISTS "Authenticated users can update weekly plans" ON public.weekly_plans;
DROP POLICY IF EXISTS "Authenticated users can delete weekly plans" ON public.weekly_plans;

CREATE POLICY "Operational roles can create weekly plans"
ON public.weekly_plans FOR INSERT TO authenticated
WITH CHECK (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','chicago_management']::app_role[]));

CREATE POLICY "Operational roles can update weekly plans"
ON public.weekly_plans FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','chicago_management']::app_role[]))
WITH CHECK (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','chicago_management']::app_role[]));

CREATE POLICY "Operational roles can delete weekly plans"
ON public.weekly_plans FOR DELETE TO authenticated
USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','chicago_management']::app_role[]));

-- invoice_number_config: restrict updates to accounting/admin/manager
DROP POLICY IF EXISTS "Allow authenticated users to update invoice config" ON public.invoice_number_config;

CREATE POLICY "Accounting roles can update invoice config"
ON public.invoice_number_config FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['accounting','admin','manager']::app_role[]))
WITH CHECK (has_any_role(ARRAY['accounting','admin','manager']::app_role[]));

-- trips_paid_status: restrict writes to accounting/admin/manager
DROP POLICY IF EXISTS "Authenticated users can insert paid status" ON public.trips_paid_status;
DROP POLICY IF EXISTS "Authenticated users can update paid status" ON public.trips_paid_status;
DROP POLICY IF EXISTS "Authenticated users can delete paid status" ON public.trips_paid_status;

CREATE POLICY "Accounting roles can insert paid status"
ON public.trips_paid_status FOR INSERT TO authenticated
WITH CHECK (has_any_role(ARRAY['accounting','admin','manager']::app_role[]));

CREATE POLICY "Accounting roles can update paid status"
ON public.trips_paid_status FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['accounting','admin','manager']::app_role[]))
WITH CHECK (has_any_role(ARRAY['accounting','admin','manager']::app_role[]));

CREATE POLICY "Accounting roles can delete paid status"
ON public.trips_paid_status FOR DELETE TO authenticated
USING (has_any_role(ARRAY['accounting','admin','manager']::app_role[]));

-- efs_other_requests: restrict updates to accounting/admin/manager
DROP POLICY IF EXISTS "Authenticated users can update EFS other requests" ON public.efs_other_requests;

CREATE POLICY "Accounting roles can update EFS other requests"
ON public.efs_other_requests FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['accounting','admin','manager']::app_role[]))
WITH CHECK (has_any_role(ARRAY['accounting','admin','manager']::app_role[]));

-- driver_weekly_salaries: restrict writes to accounting/admin/manager
DROP POLICY IF EXISTS "Authenticated users can insert driver salaries" ON public.driver_weekly_salaries;
DROP POLICY IF EXISTS "Authenticated users can update driver salaries" ON public.driver_weekly_salaries;
DROP POLICY IF EXISTS "Authenticated users can delete driver salaries" ON public.driver_weekly_salaries;

CREATE POLICY "Accounting roles can insert driver salaries"
ON public.driver_weekly_salaries FOR INSERT TO authenticated
WITH CHECK (has_any_role(ARRAY['accounting','admin','manager']::app_role[]));

CREATE POLICY "Accounting roles can update driver salaries"
ON public.driver_weekly_salaries FOR UPDATE TO authenticated
USING (has_any_role(ARRAY['accounting','admin','manager']::app_role[]))
WITH CHECK (has_any_role(ARRAY['accounting','admin','manager']::app_role[]));

CREATE POLICY "Accounting roles can delete driver salaries"
ON public.driver_weekly_salaries FOR DELETE TO authenticated
USING (has_any_role(ARRAY['accounting','admin','manager']::app_role[]));
