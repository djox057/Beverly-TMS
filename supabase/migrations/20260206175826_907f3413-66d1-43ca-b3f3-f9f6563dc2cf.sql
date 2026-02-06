
-- COMPANIES: 11 policies → 5
DROP POLICY IF EXISTS "Admins and accounting can delete companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users with roles can view companies" ON public.companies;
DROP POLICY IF EXISTS "Chicago Management can view companies" ON public.companies;
DROP POLICY IF EXISTS "Dispatch, afterhours and higher roles can create companies" ON public.companies;
DROP POLICY IF EXISTS "Drivers can view their company" ON public.companies;
DROP POLICY IF EXISTS "Maintenance can view companies" ON public.companies;
DROP POLICY IF EXISTS "Managers, admins and accounting can update companies" ON public.companies;
DROP POLICY IF EXISTS "Safety can view companies" ON public.companies;
DROP POLICY IF EXISTS "Supervisors can update companies" ON public.companies;
DROP POLICY IF EXISTS "Supervisors can view companies" ON public.companies;
DROP POLICY IF EXISTS "Yard can view companies" ON public.companies;

CREATE POLICY "Roles can view companies" ON public.companies
FOR SELECT USING (
  has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[])
);

CREATE POLICY "Drivers can view their company" ON public.companies
FOR SELECT USING (
  id IN (
    SELECT trucks.company_id FROM trucks
    WHERE trucks.driver1_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  )
);

CREATE POLICY "Roles can create companies" ON public.companies
FOR INSERT WITH CHECK (
  has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety']::app_role[])
);

CREATE POLICY "Roles can update companies" ON public.companies
FOR UPDATE USING (
  has_any_role(ARRAY['manager','admin','accounting','supervisor']::app_role[])
);

CREATE POLICY "Roles can delete companies" ON public.companies
FOR DELETE USING (
  has_any_role(ARRAY['admin','accounting']::app_role[])
);
