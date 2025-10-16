-- Continue optimizing RLS policies - Part 4: Orders table

-- ============================================================
-- ORDERS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete orders" ON public.orders;
CREATE POLICY "Admins and accounting can delete orders" 
ON public.orders FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch and higher roles can create orders" ON public.orders;
CREATE POLICY "Dispatch and higher roles can create orders" 
ON public.orders FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Dispatch can update unlocked orders" ON public.orders;
CREATE POLICY "Dispatch can update unlocked orders" 
ON public.orders FOR UPDATE
USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) AND locked = false)
WITH CHECK (has_role((SELECT auth.uid()), 'dispatch'::app_role));

DROP POLICY IF EXISTS "Dispatchers can view all orders" ON public.orders;
CREATE POLICY "Dispatchers can view all orders" 
ON public.orders FOR SELECT
USING (has_role((SELECT auth.uid()), 'dispatch'::app_role));

DROP POLICY IF EXISTS "Drivers can view their own orders" ON public.orders;
CREATE POLICY "Drivers can view their own orders" 
ON public.orders FOR SELECT
USING (
  driver1_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  ) OR driver2_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  )
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update all orders" ON public.orders;
CREATE POLICY "Managers, admins and accounting can update all orders" 
ON public.orders FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins, accounting, safety and supervisors can view a" ON public.orders;
CREATE POLICY "Managers, admins, accounting, safety and supervisors can view a" 
ON public.orders FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Safety can create orders" ON public.orders;
CREATE POLICY "Safety can create orders" 
ON public.orders FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can update unlocked orders" ON public.orders;
CREATE POLICY "Safety can update unlocked orders" 
ON public.orders FOR UPDATE
USING (has_role((SELECT auth.uid()), 'safety'::app_role) AND locked = false)
WITH CHECK (has_role((SELECT auth.uid()), 'safety'::app_role) AND locked = false);

DROP POLICY IF EXISTS "Safety can view orders" ON public.orders;
CREATE POLICY "Safety can view orders" 
ON public.orders FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create orders" ON public.orders;
CREATE POLICY "Supervisors can create orders" 
ON public.orders FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update orders" ON public.orders;
CREATE POLICY "Supervisors can update orders" 
ON public.orders FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view orders" ON public.orders;
CREATE POLICY "Supervisors can view orders" 
ON public.orders FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));