-- Continue optimizing RLS policies - Part 7: Final tables (truck files, trucks, user roles)

-- ============================================================
-- TRUCK FILES TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete truck_files" ON public.truck_files;
CREATE POLICY "Admins and accounting can delete truck_files" 
ON public.truck_files FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view truck_files" ON public.truck_files;
CREATE POLICY "Dispatch, managers, admins and accounting can view truck_files" 
ON public.truck_files FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Drivers can view their truck files" ON public.truck_files;
CREATE POLICY "Drivers can view their truck files" 
ON public.truck_files FOR SELECT
USING (truck_id IN (
  SELECT trucks.id FROM trucks
  WHERE trucks.driver1_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  )
));

DROP POLICY IF EXISTS "Managers, admins and accounting can create truck_files" ON public.truck_files;
CREATE POLICY "Managers, admins and accounting can create truck_files" 
ON public.truck_files FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update truck_files" ON public.truck_files;
CREATE POLICY "Managers, admins and accounting can update truck_files" 
ON public.truck_files FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can create truck_files" ON public.truck_files;
CREATE POLICY "Safety can create truck_files" 
ON public.truck_files FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can delete truck_files" ON public.truck_files;
CREATE POLICY "Safety can delete truck_files" 
ON public.truck_files FOR DELETE
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can view truck files" ON public.truck_files;
CREATE POLICY "Safety can view truck files" 
ON public.truck_files FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create truck_files" ON public.truck_files;
CREATE POLICY "Supervisors can create truck_files" 
ON public.truck_files FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update truck_files" ON public.truck_files;
CREATE POLICY "Supervisors can update truck_files" 
ON public.truck_files FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view truck_files" ON public.truck_files;
CREATE POLICY "Supervisors can view truck_files" 
ON public.truck_files FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- TRUCKS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete trucks" ON public.trucks;
CREATE POLICY "Admins and accounting can delete trucks" 
ON public.trucks FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view trucks" ON public.trucks;
CREATE POLICY "Dispatch, managers, admins and accounting can view trucks" 
ON public.trucks FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Drivers can view their own trucks" ON public.trucks;
CREATE POLICY "Drivers can view their own trucks" 
ON public.trucks FOR SELECT
USING (driver1_id IN (
  SELECT d.id FROM drivers d
  JOIN profiles p ON p.email = d.email
  WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
));

DROP POLICY IF EXISTS "Managers, admins and accounting can create trucks" ON public.trucks;
CREATE POLICY "Managers, admins and accounting can create trucks" 
ON public.trucks FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update trucks" ON public.trucks;
CREATE POLICY "Managers, admins and accounting can update trucks" 
ON public.trucks FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can create trucks" ON public.trucks;
CREATE POLICY "Safety can create trucks" 
ON public.trucks FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can update trucks" ON public.trucks;
CREATE POLICY "Safety can update trucks" 
ON public.trucks FOR UPDATE
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can view trucks" ON public.trucks;
CREATE POLICY "Safety can view trucks" 
ON public.trucks FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create trucks" ON public.trucks;
CREATE POLICY "Supervisors can create trucks" 
ON public.trucks FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can delete trucks" ON public.trucks;
CREATE POLICY "Supervisors can delete trucks" 
ON public.trucks FOR DELETE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update trucks" ON public.trucks;
CREATE POLICY "Supervisors can update trucks" 
ON public.trucks FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view trucks" ON public.trucks;
CREATE POLICY "Supervisors can view trucks" 
ON public.trucks FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- USER ROLES TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can view all user roles" ON public.user_roles;
CREATE POLICY "Admins and accounting can view all user roles" 
ON public.user_roles FOR SELECT
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles" 
ON public.user_roles FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
CREATE POLICY "Admins can insert user roles" 
ON public.user_roles FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
CREATE POLICY "Admins can update user roles" 
ON public.user_roles FOR UPDATE
USING (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers can view all user roles" ON public.user_roles;
CREATE POLICY "Managers can view all user roles" 
ON public.user_roles FOR SELECT
USING (has_role((SELECT auth.uid()), 'manager'::app_role));

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" 
ON public.user_roles FOR SELECT
USING (user_id = (SELECT auth.uid()));