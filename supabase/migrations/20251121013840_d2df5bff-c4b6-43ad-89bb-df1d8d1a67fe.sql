-- Optimize RLS policies - Batch 2: dispatcher_status, profiles, user_roles, trailers, companies, orders, brokers, lost_day_notes, order_files, pickup_drops, driver_files, driver_performance, drivers, trailer_files, truck_locations
-- Lines 23-43 from performance audit

-- dispatcher_status
DROP POLICY IF EXISTS "Dispatch can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Dispatch can view dispatcher status" ON public.dispatcher_status
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role))
);

-- profiles
DROP POLICY IF EXISTS "Dispatch can view dispatcher-related profiles" ON public.profiles;
CREATE POLICY "Dispatch can view dispatcher-related profiles" ON public.profiles
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) AND 
  id IN (
    SELECT user_id FROM public.user_roles 
    WHERE role IN ('dispatch'::app_role, 'afterhours'::app_role)
  )
);

-- user_roles
DROP POLICY IF EXISTS "Dispatch can view dispatcher-related user roles" ON public.user_roles;
CREATE POLICY "Dispatch can view dispatcher-related user roles" ON public.user_roles
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) AND 
  role IN ('dispatch'::app_role, 'afterhours'::app_role)
);

-- trailers
DROP POLICY IF EXISTS "Dispatch can view trailers on their trucks" ON public.trailers;
CREATE POLICY "Dispatch can view trailers on their trucks" ON public.trailers
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role))
);

-- companies
DROP POLICY IF EXISTS "Dispatch, afterhours and higher roles can create companies" ON public.companies;
CREATE POLICY "Dispatch, afterhours and higher roles can create companies" ON public.companies
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

-- orders
DROP POLICY IF EXISTS "Dispatch, afterhours and higher roles can create orders" ON public.orders;
CREATE POLICY "Dispatch, afterhours and higher roles can create orders" ON public.orders
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- brokers - create
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.brokers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can creat" ON public.brokers
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- brokers - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.brokers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.brokers
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- lost_day_notes - create
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can creat" ON public.lost_day_notes
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- lost_day_notes - update
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can updat" ON public.lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can updat" ON public.lost_day_notes
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- lost_day_notes - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.lost_day_notes
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- order_files - create
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.order_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can creat" ON public.order_files
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- order_files - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.order_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.order_files
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- pickup_drops - update
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can updat" ON public.pickup_drops;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can updat" ON public.pickup_drops
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- pickup_drops - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.pickup_drops;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.pickup_drops
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- driver_files - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_files
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- driver_performance - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_performance;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_performance
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- drivers - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.drivers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.drivers
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- trailer_files - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailer_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailer_files
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- trailers - view
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailers
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- truck_locations - view (dispatch, managers, admins and accounting)
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view truck locati" ON public.truck_locations;
CREATE POLICY "Dispatch, managers, admins and accounting can view truck locati" ON public.truck_locations
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);