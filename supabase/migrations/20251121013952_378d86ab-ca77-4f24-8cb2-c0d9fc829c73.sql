-- Optimize RLS policies - Batch 3: orders, profiles, trucks, user_roles, driver_termination_notes, order_files, driver_files, trailer_files, truck_files, driver_drug_tests, truck_locations
-- Lines 44-64 from performance audit

-- orders
DROP POLICY IF EXISTS "Dispatchers and afterhours can view all orders" ON public.orders;
CREATE POLICY "Dispatchers and afterhours can view all orders" ON public.orders
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role))
);

DROP POLICY IF EXISTS "Managers, supervisors and admins can mark loads as recovery" ON public.orders;
CREATE POLICY "Managers, supervisors and admins can mark loads as recovery" ON public.orders
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Safety can view all orders" ON public.orders;
CREATE POLICY "Safety can view all orders" ON public.orders
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

-- profiles
DROP POLICY IF EXISTS "Dispatchers and afterhours can view dispatchers, afterhours, su" ON public.profiles;
CREATE POLICY "Dispatchers and afterhours can view dispatchers, afterhours, su" ON public.profiles
FOR SELECT USING (
  ((SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR (SELECT has_role(auth.uid(), 'afterhours'::app_role))) AND 
  id IN (
    SELECT user_id FROM public.user_roles 
    WHERE role IN ('dispatch'::app_role, 'afterhours'::app_role, 'supervisor'::app_role)
  )
);

-- trucks
DROP POLICY IF EXISTS "Drivers can view their assigned trucks" ON public.trucks;
CREATE POLICY "Drivers can view their assigned trucks" ON public.trucks
FOR SELECT USING (
  driver1_id IN (
    SELECT d.id FROM drivers d 
    JOIN profiles p ON p.email = d.email 
    WHERE p.user_id = (SELECT auth.uid()) AND (SELECT has_role(p.user_id, 'driver'::app_role))
  )
);

DROP POLICY IF EXISTS "Safety can delete trucks" ON public.trucks;
CREATE POLICY "Safety can delete trucks" ON public.trucks
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

-- user_roles
DROP POLICY IF EXISTS "Managers can view user roles" ON public.user_roles;
CREATE POLICY "Managers can view user roles" ON public.user_roles
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role))
);

DROP POLICY IF EXISTS "Safety can view dispatch, supervisor, manager and admin roles" ON public.user_roles;
CREATE POLICY "Safety can view dispatch, supervisor, manager and admin roles" ON public.user_roles
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) AND 
  role IN ('dispatch'::app_role, 'supervisor'::app_role, 'manager'::app_role, 'admin'::app_role)
);

-- driver_termination_notes
DROP POLICY IF EXISTS "Managers, admins and accounting can delete termination notes" ON public.driver_termination_notes;
CREATE POLICY "Managers, admins and accounting can delete termination notes" ON public.driver_termination_notes
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- order_files
DROP POLICY IF EXISTS "Safety can create order_files" ON public.order_files;
CREATE POLICY "Safety can create order_files" ON public.order_files
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

DROP POLICY IF EXISTS "Safety can delete order_files" ON public.order_files;
CREATE POLICY "Safety can delete order_files" ON public.order_files
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

DROP POLICY IF EXISTS "Safety can update order_files" ON public.order_files;
CREATE POLICY "Safety can update order_files" ON public.order_files
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

-- driver_files
DROP POLICY IF EXISTS "Safety can update driver_files" ON public.driver_files;
CREATE POLICY "Safety can update driver_files" ON public.driver_files
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

-- trailer_files
DROP POLICY IF EXISTS "Safety can update trailer_files" ON public.trailer_files;
CREATE POLICY "Safety can update trailer_files" ON public.trailer_files
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

DROP POLICY IF EXISTS "Safety can view trailer_files" ON public.trailer_files;
CREATE POLICY "Safety can view trailer_files" ON public.trailer_files
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

-- truck_files
DROP POLICY IF EXISTS "Safety can update truck_files" ON public.truck_files;
CREATE POLICY "Safety can update truck_files" ON public.truck_files
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

-- truck_locations
DROP POLICY IF EXISTS "Safety can view truck locations" ON public.truck_locations;
CREATE POLICY "Safety can view truck locations" ON public.truck_locations
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

-- driver_drug_tests
DROP POLICY IF EXISTS "Safety, managers and admins can delete drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can delete drug tests" ON public.driver_drug_tests
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Safety, managers and admins can insert drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can insert drug tests" ON public.driver_drug_tests
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Safety, managers and admins can update drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can update drug tests" ON public.driver_drug_tests
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Safety, managers and admins can view drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can view drug tests" ON public.driver_drug_tests
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);