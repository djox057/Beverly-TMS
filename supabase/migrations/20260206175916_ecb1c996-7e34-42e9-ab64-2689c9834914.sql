
-- TRUCKS: 24 policies → 5
DROP POLICY IF EXISTS "Admins and accounting can delete trucks" ON public.trucks;
DROP POLICY IF EXISTS "Afterhours can create trucks" ON public.trucks;
DROP POLICY IF EXISTS "Afterhours can update trucks" ON public.trucks;
DROP POLICY IF EXISTS "Afterhours can view all trucks" ON public.trucks;
DROP POLICY IF EXISTS "Chicago Management can view trucks" ON public.trucks;
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.trucks;
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view trucks" ON public.trucks;
DROP POLICY IF EXISTS "Drivers can view their assigned trucks" ON public.trucks;
DROP POLICY IF EXISTS "Drivers can view their own trucks" ON public.trucks;
DROP POLICY IF EXISTS "Maintenance can create trucks" ON public.trucks;
DROP POLICY IF EXISTS "Maintenance can delete trucks" ON public.trucks;
DROP POLICY IF EXISTS "Maintenance can update trucks" ON public.trucks;
DROP POLICY IF EXISTS "Maintenance can view trucks" ON public.trucks;
DROP POLICY IF EXISTS "Managers, admins and accounting can create trucks" ON public.trucks;
DROP POLICY IF EXISTS "Managers, admins and accounting can update trucks" ON public.trucks;
DROP POLICY IF EXISTS "Safety can create trucks" ON public.trucks;
DROP POLICY IF EXISTS "Safety can delete trucks" ON public.trucks;
DROP POLICY IF EXISTS "Safety can update trucks" ON public.trucks;
DROP POLICY IF EXISTS "Safety can view trucks" ON public.trucks;
DROP POLICY IF EXISTS "Supervisors can create trucks" ON public.trucks;
DROP POLICY IF EXISTS "Supervisors can delete trucks" ON public.trucks;
DROP POLICY IF EXISTS "Supervisors can update trucks" ON public.trucks;
DROP POLICY IF EXISTS "Supervisors can view trucks" ON public.trucks;
DROP POLICY IF EXISTS "Yard can view trucks" ON public.trucks;

CREATE POLICY "Roles can view trucks" ON public.trucks
FOR SELECT USING (
  has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[])
);

CREATE POLICY "Drivers can view their trucks" ON public.trucks
FOR SELECT USING (
  driver1_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
  )
);

CREATE POLICY "Roles can create trucks" ON public.trucks
FOR INSERT WITH CHECK (
  has_any_role(ARRAY['afterhours','maintenance','admin','manager','accounting','safety','supervisor']::app_role[])
);

CREATE POLICY "Roles can update trucks" ON public.trucks
FOR UPDATE USING (
  has_any_role(ARRAY['afterhours','maintenance','admin','manager','accounting','safety','supervisor']::app_role[])
) WITH CHECK (
  has_any_role(ARRAY['afterhours','maintenance','admin','manager','accounting','safety','supervisor']::app_role[])
);

CREATE POLICY "Roles can delete trucks" ON public.trucks
FOR DELETE USING (
  has_any_role(ARRAY['admin','accounting','maintenance','safety','supervisor']::app_role[])
);
