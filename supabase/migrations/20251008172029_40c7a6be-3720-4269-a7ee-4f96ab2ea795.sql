-- Update all RLS policies to give accounting same access as admin

-- Brokers table policies
DROP POLICY IF EXISTS "Admins can delete brokers" ON brokers;
CREATE POLICY "Admins and accounting can delete brokers" ON brokers
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view brokers" ON brokers;
CREATE POLICY "Dispatch, managers, admins and accounting can view brokers" ON brokers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers and admins can update brokers" ON brokers;
CREATE POLICY "Managers, admins and accounting can update brokers" ON brokers
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can create brokers" ON brokers;
CREATE POLICY "Dispatch, managers, admins and accounting can create brokers" ON brokers
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

-- Continue with other tables...
DROP POLICY IF EXISTS "Admins can delete companies" ON companies;
CREATE POLICY "Admins and accounting can delete companies" ON companies
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update companies" ON companies;
CREATE POLICY "Managers, admins and accounting can update companies" ON companies
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view companies" ON companies;
CREATE POLICY "Dispatch, managers, admins and accounting can view companies" ON companies
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete driver_files" ON driver_files;
CREATE POLICY "Admins and accounting can delete driver_files" ON driver_files
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can create driver_files" ON driver_files;
CREATE POLICY "Managers, admins and accounting can create driver_files" ON driver_files
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update driver_files" ON driver_files;
CREATE POLICY "Managers, admins and accounting can update driver_files" ON driver_files
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view driver_files" ON driver_files;
CREATE POLICY "Dispatch, managers, admins and accounting can view driver_files" ON driver_files
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can view PII audit logs" ON driver_pii_audit_log;
CREATE POLICY "Admins and accounting can view PII audit logs" ON driver_pii_audit_log
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Admins can delete driver sensitive PII" ON driver_sensitive_pii;
CREATE POLICY "Admins and accounting can delete driver sensitive PII" ON driver_sensitive_pii
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can create driver sensitive PII" ON driver_sensitive_pii;
CREATE POLICY "Managers, admins and accounting can create driver sensitive PII" ON driver_sensitive_pii
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update driver sensitive PII" ON driver_sensitive_pii;
CREATE POLICY "Managers, admins and accounting can update driver sensitive PII" ON driver_sensitive_pii
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can view driver sensitive PII" ON driver_sensitive_pii;
CREATE POLICY "Managers, admins and accounting can view driver sensitive PII" ON driver_sensitive_pii
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Admins can delete drivers" ON drivers;
CREATE POLICY "Admins and accounting can delete drivers" ON drivers
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can create drivers" ON drivers;
CREATE POLICY "Managers, admins and accounting can create drivers" ON drivers
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update drivers" ON drivers;
CREATE POLICY "Managers, admins and accounting can update drivers" ON drivers
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view drivers" ON drivers;
CREATE POLICY "Dispatch, managers, admins and accounting can view drivers" ON drivers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete lost day notes" ON lost_day_notes;
CREATE POLICY "Admins and accounting can delete lost day notes" ON lost_day_notes
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can create lost day notes" ON lost_day_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can create lost day notes" ON lost_day_notes
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers and admins can update lost day notes" ON lost_day_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can update lost day notes" ON lost_day_notes
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers and admins can view lost day notes" ON lost_day_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can view lost day notes" ON lost_day_notes
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete order_files" ON order_files;
CREATE POLICY "Admins and accounting can delete order_files" ON order_files
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can create order_files" ON order_files;
CREATE POLICY "Dispatch, managers, admins and accounting can create order_files" ON order_files
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers and admins can update order_files" ON order_files;
CREATE POLICY "Managers, admins and accounting can update order_files" ON order_files
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view order_files" ON order_files;
CREATE POLICY "Dispatch, managers, admins and accounting can view order_files" ON order_files
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete orders" ON orders;
CREATE POLICY "Admins and accounting can delete orders" ON orders
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update all orders" ON orders;
CREATE POLICY "Managers, admins and accounting can update all orders" ON orders
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role))
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view orders" ON orders;
CREATE POLICY "Dispatch, managers, admins and accounting can view orders" ON orders
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete pickup_drops" ON pickup_drops;
CREATE POLICY "Admins and accounting can delete pickup_drops" ON pickup_drops
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can create pickup_drops" ON pickup_drops;
CREATE POLICY "Dispatch, managers, admins and accounting can create pickup_drops" ON pickup_drops
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers and admins can update pickup_drops" ON pickup_drops;
CREATE POLICY "Dispatch, managers, admins and accounting can update pickup_drops" ON pickup_drops
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers and admins can view pickup_drops" ON pickup_drops;
CREATE POLICY "Dispatch, managers, admins and accounting can view pickup_drops" ON pickup_drops
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins and accounting can view all profiles" ON profiles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers can view all profiles" ON profiles;
CREATE POLICY "Managers, admins and accounting can view all profiles" ON profiles
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Admins can delete trailer_files" ON trailer_files;
CREATE POLICY "Admins and accounting can delete trailer_files" ON trailer_files
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can create trailer_files" ON trailer_files;
CREATE POLICY "Managers, admins and accounting can create trailer_files" ON trailer_files
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update trailer_files" ON trailer_files;
CREATE POLICY "Managers, admins and accounting can update trailer_files" ON trailer_files
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view trailer_files" ON trailer_files;
CREATE POLICY "Dispatch, managers, admins and accounting can view trailer_files" ON trailer_files
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete trailers" ON trailers;
CREATE POLICY "Admins and accounting can delete trailers" ON trailers
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can create trailers" ON trailers;
CREATE POLICY "Managers, admins and accounting can create trailers" ON trailers
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update trailers" ON trailers;
CREATE POLICY "Managers, admins and accounting can update trailers" ON trailers
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view trailers" ON trailers;
CREATE POLICY "Dispatch, managers, admins and accounting can view trailers" ON trailers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete truck_files" ON truck_files;
CREATE POLICY "Admins and accounting can delete truck_files" ON truck_files
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can create truck_files" ON truck_files;
CREATE POLICY "Managers, admins and accounting can create truck_files" ON truck_files
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update truck_files" ON truck_files;
CREATE POLICY "Managers, admins and accounting can update truck_files" ON truck_files
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view truck_files" ON truck_files;
CREATE POLICY "Dispatch, managers, admins and accounting can view truck_files" ON truck_files
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers and admins can view truck locations" ON truck_locations;
CREATE POLICY "Dispatch, managers, admins and accounting can view truck locations" ON truck_locations
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete truck notes" ON truck_notes;
CREATE POLICY "Admins and accounting can delete truck notes" ON truck_notes
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can create truck notes" ON truck_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can create truck notes" ON truck_notes
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers and admins can update truck notes" ON truck_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can update truck notes" ON truck_notes
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers and admins can view truck notes" ON truck_notes;
CREATE POLICY "Dispatch, managers, admins and accounting can view truck notes" ON truck_notes
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete trucks" ON trucks;
CREATE POLICY "Admins and accounting can delete trucks" ON trucks
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can create trucks" ON trucks;
CREATE POLICY "Managers, admins and accounting can create trucks" ON trucks
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update trucks" ON trucks;
CREATE POLICY "Managers, admins and accounting can update trucks" ON trucks
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers and admins can view trucks" ON trucks;
CREATE POLICY "Dispatch, managers, admins and accounting can view trucks" ON trucks
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
CREATE POLICY "Admins and accounting can manage all roles" ON user_roles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));