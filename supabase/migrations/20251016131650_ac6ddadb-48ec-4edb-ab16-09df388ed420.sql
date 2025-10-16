-- Continue optimizing RLS policies - Part 6: Final tables

-- ============================================================
-- TRAILER FILES TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete trailer_files" ON public.trailer_files;
CREATE POLICY "Admins and accounting can delete trailer_files" 
ON public.trailer_files FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view trailer_file" ON public.trailer_files;
CREATE POLICY "Dispatch, managers, admins and accounting can view trailer_file" 
ON public.trailer_files FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Drivers can view their trailer files" ON public.trailer_files;
CREATE POLICY "Drivers can view their trailer files" 
ON public.trailer_files FOR SELECT
USING (trailer_id IN (
  SELECT trucks.trailer_id FROM trucks
  WHERE trucks.driver1_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  )
));

DROP POLICY IF EXISTS "Managers, admins and accounting can create trailer_files" ON public.trailer_files;
CREATE POLICY "Managers, admins and accounting can create trailer_files" 
ON public.trailer_files FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update trailer_files" ON public.trailer_files;
CREATE POLICY "Managers, admins and accounting can update trailer_files" 
ON public.trailer_files FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can create trailer_files" ON public.trailer_files;
CREATE POLICY "Safety can create trailer_files" 
ON public.trailer_files FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can delete trailer_files" ON public.trailer_files;
CREATE POLICY "Safety can delete trailer_files" 
ON public.trailer_files FOR DELETE
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can view trailer files" ON public.trailer_files;
CREATE POLICY "Safety can view trailer files" 
ON public.trailer_files FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create trailer_files" ON public.trailer_files;
CREATE POLICY "Supervisors can create trailer_files" 
ON public.trailer_files FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update trailer_files" ON public.trailer_files;
CREATE POLICY "Supervisors can update trailer_files" 
ON public.trailer_files FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view trailer_files" ON public.trailer_files;
CREATE POLICY "Supervisors can view trailer_files" 
ON public.trailer_files FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- TRAILERS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete trailers" ON public.trailers;
CREATE POLICY "Admins and accounting can delete trailers" 
ON public.trailers FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view trailers" ON public.trailers;
CREATE POLICY "Dispatch, managers, admins and accounting can view trailers" 
ON public.trailers FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Drivers can view trailers on their trucks" ON public.trailers;
CREATE POLICY "Drivers can view trailers on their trucks" 
ON public.trailers FOR SELECT
USING (id IN (
  SELECT trucks.trailer_id FROM trucks
  WHERE trucks.driver1_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  )
));

DROP POLICY IF EXISTS "Managers, admins and accounting can create trailers" ON public.trailers;
CREATE POLICY "Managers, admins and accounting can create trailers" 
ON public.trailers FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update trailers" ON public.trailers;
CREATE POLICY "Managers, admins and accounting can update trailers" 
ON public.trailers FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can create trailers" ON public.trailers;
CREATE POLICY "Safety can create trailers" 
ON public.trailers FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can update trailers" ON public.trailers;
CREATE POLICY "Safety can update trailers" 
ON public.trailers FOR UPDATE
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can view trailers" ON public.trailers;
CREATE POLICY "Safety can view trailers" 
ON public.trailers FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create trailers" ON public.trailers;
CREATE POLICY "Supervisors can create trailers" 
ON public.trailers FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update trailers" ON public.trailers;
CREATE POLICY "Supervisors can update trailers" 
ON public.trailers FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view trailers" ON public.trailers;
CREATE POLICY "Supervisors can view trailers" 
ON public.trailers FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));