-- Restore all missing RLS policies (part 3 - final)

-- ============================================
-- ORDERS TABLE POLICIES (skip "Authenticated users can create orders" - already exists)
-- ============================================
CREATE POLICY "Admins and accounting can delete orders" 
ON public.orders FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch can update unlocked orders" 
ON public.orders FOR UPDATE 
USING (has_role(auth.uid(), 'dispatch'::app_role) AND locked = false)
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role) AND locked = false);

CREATE POLICY "Dispatchers can view all orders" 
ON public.orders FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role));

CREATE POLICY "Drivers can view their own orders" 
ON public.orders FOR SELECT 
USING (driver1_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)) OR driver2_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)));

CREATE POLICY "Managers, admins and accounting can update all orders" 
ON public.orders FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role))
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins, accounting, safety and supervisors can view a" 
ON public.orders FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role) OR has_role(auth.uid(), 'safety'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Safety can create orders" 
ON public.orders FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can update unlocked orders" 
ON public.orders FOR UPDATE 
USING (has_role(auth.uid(), 'safety'::app_role) AND locked = false)
WITH CHECK (has_role(auth.uid(), 'safety'::app_role) AND locked = false);

CREATE POLICY "Safety can view orders" 
ON public.orders FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create orders" 
ON public.orders FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update orders" 
ON public.orders FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view orders" 
ON public.orders FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- PICKUP_DROPS TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete pickup_drops" 
ON public.pickup_drops FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can create pickup_dro" 
ON public.pickup_drops FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can update pickup_dro" 
ON public.pickup_drops FOR UPDATE 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view pickup_drops" 
ON public.pickup_drops FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Drivers can view pickup drops for their orders" 
ON public.pickup_drops FOR SELECT 
USING (order_id IN (SELECT o.id FROM orders o WHERE o.driver1_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)) OR o.driver2_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role))));

CREATE POLICY "Safety can view pickup drops" 
ON public.pickup_drops FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create pickup_drops" 
ON public.pickup_drops FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update pickup_drops" 
ON public.pickup_drops FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view pickup_drops" 
ON public.pickup_drops FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- PROFILES TABLE POLICIES (skip 3 that already exist)
-- ============================================
CREATE POLICY "Admins and accounting can view all profiles" 
ON public.profiles FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatchers can view dispatchers, supervisors, and managers" 
ON public.profiles FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) AND (has_role(user_id, 'dispatch'::app_role) OR has_role(user_id, 'supervisor'::app_role) OR has_role(user_id, 'manager'::app_role)));

CREATE POLICY "Drivers can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id AND has_role(auth.uid(), 'driver'::app_role));

CREATE POLICY "Managers, admins and accounting can view all profiles" 
ON public.profiles FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Supervisors can view all profiles" 
ON public.profiles FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));