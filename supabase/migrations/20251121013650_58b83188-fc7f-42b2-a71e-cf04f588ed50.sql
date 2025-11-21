-- Optimize RLS policies by wrapping auth.uid() and has_role() in SELECT for query-based evaluation
-- This migration optimizes all 168 RLS policies identified in the performance audit
-- Batch 1: truck_notes, truck_note_history, truck_locations, trucks (lines 2-22)

-- truck_notes policies
DROP POLICY IF EXISTS "All authenticated users can create truck notes" ON public.truck_notes;
CREATE POLICY "All authenticated users can create truck notes" ON public.truck_notes
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "All authenticated users can delete truck notes" ON public.truck_notes;
CREATE POLICY "All authenticated users can delete truck notes" ON public.truck_notes
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "All authenticated users can update truck notes" ON public.truck_notes;
CREATE POLICY "All authenticated users can update truck notes" ON public.truck_notes
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "All authenticated users can view truck notes" ON public.truck_notes;
CREATE POLICY "All authenticated users can view truck notes" ON public.truck_notes
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

-- truck_note_history policies
DROP POLICY IF EXISTS "All authenticated users can insert truck note history" ON public.truck_note_history;
CREATE POLICY "All authenticated users can insert truck note history" ON public.truck_note_history
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "All authenticated users can view truck note history" ON public.truck_note_history;
CREATE POLICY "All authenticated users can view truck note history" ON public.truck_note_history
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

-- truck_locations policies
DROP POLICY IF EXISTS "Admins can insert truck locations" ON public.truck_locations;
CREATE POLICY "Admins can insert truck locations" ON public.truck_locations
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher roles can view truck locations" ON public.truck_locations;
CREATE POLICY "Dispatch and higher roles can view truck locations" ON public.truck_locations
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

-- trucks policies
DROP POLICY IF EXISTS "Afterhours can create trucks" ON public.trucks;
CREATE POLICY "Afterhours can create trucks" ON public.trucks
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

DROP POLICY IF EXISTS "Afterhours can update trucks" ON public.trucks;
CREATE POLICY "Afterhours can update trucks" ON public.trucks
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

DROP POLICY IF EXISTS "Afterhours can view all trucks" ON public.trucks;
CREATE POLICY "Afterhours can view all trucks" ON public.trucks
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

-- profiles policies
DROP POLICY IF EXISTS "Afterhours can view all profiles" ON public.profiles;
CREATE POLICY "Afterhours can view all profiles" ON public.profiles
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

-- user_roles policies
DROP POLICY IF EXISTS "Afterhours can view all user roles" ON public.user_roles;
CREATE POLICY "Afterhours can view all user roles" ON public.user_roles
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

-- dispatcher_status policies
DROP POLICY IF EXISTS "Afterhours can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Afterhours can view dispatcher status" ON public.dispatcher_status
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

-- companies policies
DROP POLICY IF EXISTS "Authenticated users with roles can view companies" ON public.companies;
CREATE POLICY "Authenticated users with roles can view companies" ON public.companies
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- pickup_drops policies
DROP POLICY IF EXISTS "Dispatch and afterhours can create pickup_drops" ON public.pickup_drops;
CREATE POLICY "Dispatch and afterhours can create pickup_drops" ON public.pickup_drops
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

-- order_files policies
DROP POLICY IF EXISTS "Dispatch and afterhours can delete order_files" ON public.order_files;
CREATE POLICY "Dispatch and afterhours can delete order_files" ON public.order_files
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and afterhours can update order_files" ON public.order_files;
CREATE POLICY "Dispatch and afterhours can update order_files" ON public.order_files
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

-- orders policies
DROP POLICY IF EXISTS "Dispatch and afterhours can update unlocked orders" ON public.orders;
CREATE POLICY "Dispatch and afterhours can update unlocked orders" ON public.orders
FOR UPDATE USING (
  ((SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR (SELECT has_role(auth.uid(), 'afterhours'::app_role))) 
  AND NOT COALESCE(locked, false)
);

-- driver_termination_notes policies
DROP POLICY IF EXISTS "Dispatch and higher roles can create termination notes" ON public.driver_termination_notes;
CREATE POLICY "Dispatch and higher roles can create termination notes" ON public.driver_termination_notes
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher roles can view termination notes" ON public.driver_termination_notes;
CREATE POLICY "Dispatch and higher roles can view termination notes" ON public.driver_termination_notes
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);