-- Optimize ALL RLS policies by wrapping auth.uid() and has_role() in SELECT statements
-- This prevents re-evaluation for each row and improves query performance significantly

-- TRUCK_NOTES
DROP POLICY IF EXISTS "All authenticated users can create truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "All authenticated users can delete truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "All authenticated users can update truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "All authenticated users can view truck notes" ON public.truck_notes;

CREATE POLICY "All authenticated users can create truck notes" ON public.truck_notes FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role) OR has_role((SELECT auth.uid()), 'maintenance'::app_role) OR has_role((SELECT auth.uid()), 'chicago_management'::app_role));

CREATE POLICY "All authenticated users can delete truck notes" ON public.truck_notes FOR DELETE USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role) OR has_role((SELECT auth.uid()), 'maintenance'::app_role) OR has_role((SELECT auth.uid()), 'chicago_management'::app_role));

CREATE POLICY "All authenticated users can update truck notes" ON public.truck_notes FOR UPDATE USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role) OR has_role((SELECT auth.uid()), 'maintenance'::app_role) OR has_role((SELECT auth.uid()), 'chicago_management'::app_role));

CREATE POLICY "All authenticated users can view truck notes" ON public.truck_notes FOR SELECT USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role) OR has_role((SELECT auth.uid()), 'maintenance'::app_role) OR has_role((SELECT auth.uid()), 'chicago_management'::app_role));

-- TRUCK_NOTE_HISTORY
DROP POLICY IF EXISTS "All authenticated users can insert truck note history" ON public.truck_note_history;
DROP POLICY IF EXISTS "All authenticated users can view truck note history" ON public.truck_note_history;

CREATE POLICY "All authenticated users can insert truck note history" ON public.truck_note_history FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role) OR has_role((SELECT auth.uid()), 'maintenance'::app_role) OR has_role((SELECT auth.uid()), 'chicago_management'::app_role));

CREATE POLICY "All authenticated users can view truck note history" ON public.truck_note_history FOR SELECT USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role) OR has_role((SELECT auth.uid()), 'maintenance'::app_role) OR has_role((SELECT auth.uid()), 'chicago_management'::app_role));

-- TRUCK_LOCATIONS
DROP POLICY IF EXISTS "Admins can insert truck locations" ON public.truck_locations;
DROP POLICY IF EXISTS "Dispatch and higher roles can view truck locations" ON public.truck_locations;

CREATE POLICY "Admins can insert truck locations" ON public.truck_locations FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "Dispatch and higher roles can view truck locations" ON public.truck_locations FOR SELECT USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role) OR has_role((SELECT auth.uid()), 'maintenance'::app_role) OR has_role((SELECT auth.uid()), 'chicago_management'::app_role));

-- TRUCKS
DROP POLICY IF EXISTS "Afterhours can create trucks" ON public.trucks;
DROP POLICY IF EXISTS "Afterhours can update trucks" ON public.trucks;
DROP POLICY IF EXISTS "Afterhours can view all trucks" ON public.trucks;

CREATE POLICY "Afterhours can create trucks" ON public.trucks FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'afterhours'::app_role));
CREATE POLICY "Afterhours can update trucks" ON public.trucks FOR UPDATE USING (has_role((SELECT auth.uid()), 'afterhours'::app_role));
CREATE POLICY "Afterhours can view all trucks" ON public.trucks FOR SELECT USING (has_role((SELECT auth.uid()), 'afterhours'::app_role));

-- PROFILES
DROP POLICY IF EXISTS "Afterhours can view all profiles" ON public.profiles;
CREATE POLICY "Afterhours can view all profiles" ON public.profiles FOR SELECT USING (has_role((SELECT auth.uid()), 'afterhours'::app_role));

-- USER_ROLES
DROP POLICY IF EXISTS "Afterhours can view all user roles" ON public.user_roles;
CREATE POLICY "Afterhours can view all user roles" ON public.user_roles FOR SELECT USING (has_role((SELECT auth.uid()), 'afterhours'::app_role));

-- DISPATCHER_STATUS
DROP POLICY IF EXISTS "Afterhours can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Afterhours can view dispatcher status" ON public.dispatcher_status FOR SELECT USING (has_role((SELECT auth.uid()), 'afterhours'::app_role));

-- COMPANIES
DROP POLICY IF EXISTS "Authenticated users with roles can view companies" ON public.companies;
CREATE POLICY "Authenticated users with roles can view companies" ON public.companies FOR SELECT USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role));

-- PICKUP_DROPS
DROP POLICY IF EXISTS "Dispatch and afterhours can create pickup_drops" ON public.pickup_drops;
CREATE POLICY "Dispatch and afterhours can create pickup_drops" ON public.pickup_drops FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role));

-- ORDER_FILES
DROP POLICY IF EXISTS "Dispatch and afterhours can delete order_files" ON public.order_files;
DROP POLICY IF EXISTS "Dispatch and afterhours can update order_files" ON public.order_files;

CREATE POLICY "Dispatch and afterhours can delete order_files" ON public.order_files FOR DELETE USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role));
CREATE POLICY "Dispatch and afterhours can update order_files" ON public.order_files FOR UPDATE USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role));

-- ORDERS - only optimize locked check
DROP POLICY IF EXISTS "Dispatch and afterhours can update unlocked orders" ON public.orders;
CREATE POLICY "Dispatch and afterhours can update unlocked orders" ON public.orders FOR UPDATE USING ((has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role)) AND (locked IS NULL OR locked = false));

-- DRIVER_TERMINATION_NOTES
DROP POLICY IF EXISTS "Dispatch and higher roles can create termination notes" ON public.driver_termination_notes;
DROP POLICY IF EXISTS "Dispatch and higher roles can view termination notes" ON public.driver_termination_notes;

CREATE POLICY "Dispatch and higher roles can create termination notes" ON public.driver_termination_notes FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

CREATE POLICY "Dispatch and higher roles can view termination notes" ON public.driver_termination_notes FOR SELECT USING (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR has_role((SELECT auth.uid()), 'afterhours'::app_role) OR has_role((SELECT auth.uid()), 'supervisor'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role) OR has_role((SELECT auth.uid()), 'safety'::app_role));