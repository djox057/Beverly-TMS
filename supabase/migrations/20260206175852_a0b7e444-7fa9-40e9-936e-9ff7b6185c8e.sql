
-- DRIVERS: 22 policies → 5
DROP POLICY IF EXISTS "Accounting can update drivers" ON public.drivers;
DROP POLICY IF EXISTS "Admins and accounting can delete drivers" ON public.drivers;
DROP POLICY IF EXISTS "Authenticated users can view driver companies" ON public.drivers;
DROP POLICY IF EXISTS "Chicago Management can view drivers" ON public.drivers;
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view their own profile" ON public.drivers;
DROP POLICY IF EXISTS "Maintenance can create drivers" ON public.drivers;
DROP POLICY IF EXISTS "Maintenance can delete drivers" ON public.drivers;
DROP POLICY IF EXISTS "Maintenance can update drivers" ON public.drivers;
DROP POLICY IF EXISTS "Maintenance can view drivers" ON public.drivers;
DROP POLICY IF EXISTS "Managers, admins and accounting can create drivers" ON public.drivers;
DROP POLICY IF EXISTS "Managers, admins and accounting can update drivers" ON public.drivers;
DROP POLICY IF EXISTS "Safety can create drivers" ON public.drivers;
DROP POLICY IF EXISTS "Safety can delete drivers" ON public.drivers;
DROP POLICY IF EXISTS "Safety can update drivers" ON public.drivers;
DROP POLICY IF EXISTS "Safety can view drivers" ON public.drivers;
DROP POLICY IF EXISTS "Supervisors can create drivers" ON public.drivers;
DROP POLICY IF EXISTS "Supervisors can delete drivers" ON public.drivers;
DROP POLICY IF EXISTS "Supervisors can update drivers" ON public.drivers;
DROP POLICY IF EXISTS "Supervisors can view drivers" ON public.drivers;
DROP POLICY IF EXISTS "Yard can view drivers" ON public.drivers;

CREATE POLICY "Roles can view drivers" ON public.drivers
FOR SELECT USING (
  has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[])
);

CREATE POLICY "Drivers can view own profile" ON public.drivers
FOR SELECT USING (
  auth.uid() IN (
    SELECT profiles.user_id FROM profiles
    WHERE profiles.email = drivers.email AND has_role(profiles.user_id, 'driver'::app_role)
  )
);

CREATE POLICY "Roles can create drivers" ON public.drivers
FOR INSERT WITH CHECK (
  has_any_role(ARRAY['admin','manager','accounting','maintenance','safety','supervisor']::app_role[])
);

CREATE POLICY "Roles can update drivers" ON public.drivers
FOR UPDATE USING (
  has_any_role(ARRAY['admin','manager','accounting','maintenance','safety','supervisor']::app_role[])
);

CREATE POLICY "Roles can delete drivers" ON public.drivers
FOR DELETE USING (
  has_any_role(ARRAY['admin','accounting','maintenance','safety','supervisor']::app_role[])
);
