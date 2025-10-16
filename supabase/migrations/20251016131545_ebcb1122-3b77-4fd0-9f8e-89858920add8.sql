-- Continue optimizing RLS policies - Part 5: Pickup drops, profiles, and remaining tables

-- ============================================================
-- PICKUP DROPS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Accounting can create pickup_drops" ON public.pickup_drops;
CREATE POLICY "Accounting can create pickup_drops" 
ON public.pickup_drops FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Admin can create pickup_drops" ON public.pickup_drops;
CREATE POLICY "Admin can create pickup_drops" 
ON public.pickup_drops FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins and accounting can delete pickup_drops" ON public.pickup_drops;
CREATE POLICY "Admins and accounting can delete pickup_drops" 
ON public.pickup_drops FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch can create pickup_drops" ON public.pickup_drops;
CREATE POLICY "Dispatch can create pickup_drops" 
ON public.pickup_drops FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'dispatch'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can update pickup_dro" ON public.pickup_drops;
CREATE POLICY "Dispatch, managers, admins and accounting can update pickup_dro" 
ON public.pickup_drops FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view pickup_drops" ON public.pickup_drops;
CREATE POLICY "Dispatch, managers, admins and accounting can view pickup_drops" 
ON public.pickup_drops FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Drivers can view pickup drops for their orders" ON public.pickup_drops;
CREATE POLICY "Drivers can view pickup drops for their orders" 
ON public.pickup_drops FOR SELECT
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

DROP POLICY IF EXISTS "Manager can create pickup_drops" ON public.pickup_drops;
CREATE POLICY "Manager can create pickup_drops" 
ON public.pickup_drops FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'manager'::app_role));

DROP POLICY IF EXISTS "Safety can view pickup drops" ON public.pickup_drops;
CREATE POLICY "Safety can view pickup drops" 
ON public.pickup_drops FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisor can create pickup_drops" ON public.pickup_drops;
CREATE POLICY "Supervisor can create pickup_drops" 
ON public.pickup_drops FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update pickup_drops" ON public.pickup_drops;
CREATE POLICY "Supervisors can update pickup_drops" 
ON public.pickup_drops FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view pickup_drops" ON public.pickup_drops;
CREATE POLICY "Supervisors can view pickup_drops" 
ON public.pickup_drops FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- PROFILES TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can view all profiles" ON public.profiles;
CREATE POLICY "Admins and accounting can view all profiles" 
ON public.profiles FOR ALL
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatchers can view dispatchers, supervisors, and managers" ON public.profiles;
CREATE POLICY "Dispatchers can view dispatchers, supervisors, and managers" 
ON public.profiles FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) AND 
  (has_role(user_id, 'dispatch'::app_role) OR has_role(user_id, 'supervisor'::app_role) OR has_role(user_id, 'manager'::app_role))
);

DROP POLICY IF EXISTS "Drivers can update their own profile" ON public.profiles;
CREATE POLICY "Drivers can update their own profile" 
ON public.profiles FOR UPDATE
USING ((SELECT auth.uid()) = user_id AND has_role((SELECT auth.uid()), 'driver'::app_role));

DROP POLICY IF EXISTS "Managers, admins and accounting can view all profiles" ON public.profiles;
CREATE POLICY "Managers, admins and accounting can view all profiles" 
ON public.profiles FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Supervisors can view all profiles" ON public.profiles;
CREATE POLICY "Supervisors can view all profiles" 
ON public.profiles FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT
USING ((SELECT auth.uid()) = user_id);