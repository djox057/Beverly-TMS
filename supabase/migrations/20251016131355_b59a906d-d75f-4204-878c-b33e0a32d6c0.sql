-- Continue optimizing RLS policies - Part 3: Orders and related tables

-- ============================================================
-- LOST DAY NOTES TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete lost day notes" ON public.lost_day_notes;
CREATE POLICY "Admins and accounting can delete lost day notes" 
ON public.lost_day_notes FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can create lost day n" ON public.lost_day_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can create lost day n" 
ON public.lost_day_notes FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can update lost day n" ON public.lost_day_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can update lost day n" 
ON public.lost_day_notes FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view lost day not" ON public.lost_day_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can view lost day not" 
ON public.lost_day_notes FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Safety can view lost day notes" 
ON public.lost_day_notes FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create lost day notes" ON public.lost_day_notes;
CREATE POLICY "Supervisors can create lost day notes" 
ON public.lost_day_notes FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update lost day notes" ON public.lost_day_notes;
CREATE POLICY "Supervisors can update lost day notes" 
ON public.lost_day_notes FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Supervisors can view lost day notes" 
ON public.lost_day_notes FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- ORDER FILES TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete order_files" ON public.order_files;
CREATE POLICY "Admins and accounting can delete order_files" 
ON public.order_files FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch can delete order_files" ON public.order_files;
CREATE POLICY "Dispatch can delete order_files" 
ON public.order_files FOR DELETE
USING (has_role((SELECT auth.uid()), 'dispatch'::app_role));

DROP POLICY IF EXISTS "Dispatch can update order_files" ON public.order_files;
CREATE POLICY "Dispatch can update order_files" 
ON public.order_files FOR UPDATE
USING (has_role((SELECT auth.uid()), 'dispatch'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'dispatch'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can create order_file" ON public.order_files;
CREATE POLICY "Dispatch, managers, admins and accounting can create order_file" 
ON public.order_files FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view order_files" ON public.order_files;
CREATE POLICY "Dispatch, managers, admins and accounting can view order_files" 
ON public.order_files FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Drivers can view files for their orders" ON public.order_files;
CREATE POLICY "Drivers can view files for their orders" 
ON public.order_files FOR SELECT
USING (order_id IN (
  SELECT o.id FROM orders o
  WHERE o.driver1_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  ) OR o.driver2_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  )
));

DROP POLICY IF EXISTS "Managers, admins and accounting can update order_files" ON public.order_files;
CREATE POLICY "Managers, admins and accounting can update order_files" 
ON public.order_files FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can view order files" ON public.order_files;
CREATE POLICY "Safety can view order files" 
ON public.order_files FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create order_files" ON public.order_files;
CREATE POLICY "Supervisors can create order_files" 
ON public.order_files FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update order_files" ON public.order_files;
CREATE POLICY "Supervisors can update order_files" 
ON public.order_files FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view order_files" ON public.order_files;
CREATE POLICY "Supervisors can view order_files" 
ON public.order_files FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));