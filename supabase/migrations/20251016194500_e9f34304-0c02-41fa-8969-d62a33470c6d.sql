-- Update all RLS policies to include 'afterhours' wherever 'dispatch' is mentioned

-- BROKERS TABLE
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view brokers" ON brokers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view brokers" 
ON brokers FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can create brokers" ON brokers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can create brokers" 
ON brokers FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- COMPANIES TABLE
DROP POLICY IF EXISTS "Dispatch and higher roles can create companies" ON companies;
CREATE POLICY "Dispatch, afterhours and higher roles can create companies" 
ON companies FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'safety'::app_role)
);

DROP POLICY IF EXISTS "Authenticated users with roles can view companies" ON companies;
CREATE POLICY "Authenticated users with roles can view companies" 
ON companies FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'safety'::app_role)
);

-- DRIVER_FILES TABLE
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view driver_files" ON driver_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view driver_files" 
ON driver_files FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- DRIVER_PERFORMANCE TABLE
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view driver perfo" ON driver_performance;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view driver perfo" 
ON driver_performance FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- DRIVERS TABLE
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view drivers" ON drivers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view drivers" 
ON drivers FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- LOST_DAY_NOTES TABLE
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can create lost day n" ON lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can create lost day n" 
ON lost_day_notes FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can update lost day n" ON lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can update lost day n" 
ON lost_day_notes FOR UPDATE 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view lost day not" ON lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view lost day not" 
ON lost_day_notes FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- ORDER_FILES TABLE
DROP POLICY IF EXISTS "Dispatch can delete order_files" ON order_files;
CREATE POLICY "Dispatch and afterhours can delete order_files" 
ON order_files FOR DELETE 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role)
);

DROP POLICY IF EXISTS "Dispatch can update order_files" ON order_files;
CREATE POLICY "Dispatch and afterhours can update order_files" 
ON order_files FOR UPDATE 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role)
) 
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can create order_file" ON order_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can create order_file" 
ON order_files FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view order_files" ON order_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view order_files" 
ON order_files FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- ORDERS TABLE
DROP POLICY IF EXISTS "Dispatch and higher roles can create orders" ON orders;
CREATE POLICY "Dispatch, afterhours and higher roles can create orders" 
ON orders FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role) OR 
  has_role(auth.uid(), 'safety'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Dispatch can update unlocked orders" ON orders;
CREATE POLICY "Dispatch and afterhours can update unlocked orders" 
ON orders FOR UPDATE 
USING (
  (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'afterhours'::app_role)) 
  AND locked = false
) 
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role)
);

DROP POLICY IF EXISTS "Dispatchers can view all orders" ON orders;
CREATE POLICY "Dispatchers and afterhours can view all orders" 
ON orders FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role)
);

-- PICKUP_DROPS TABLE
DROP POLICY IF EXISTS "Dispatch can create pickup_drops" ON pickup_drops;
CREATE POLICY "Dispatch and afterhours can create pickup_drops" 
ON pickup_drops FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can update pickup_dro" ON pickup_drops;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can update pickup_dro" 
ON pickup_drops FOR UPDATE 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view pickup_drops" ON pickup_drops;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view pickup_drops" 
ON pickup_drops FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- PROFILES TABLE
DROP POLICY IF EXISTS "Dispatchers can view dispatchers, supervisors, and managers" ON profiles;
CREATE POLICY "Dispatchers and afterhours can view dispatchers, afterhours, supervisors, and managers" 
ON profiles FOR SELECT 
USING (
  (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'afterhours'::app_role)) 
  AND (
    has_role(user_id, 'dispatch'::app_role) OR 
    has_role(user_id, 'afterhours'::app_role) OR 
    has_role(user_id, 'supervisor'::app_role) OR 
    has_role(user_id, 'manager'::app_role)
  )
);

-- TRAILER_FILES TABLE
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view trailer_file" ON trailer_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view trailer_file" 
ON trailer_files FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- TRAILERS TABLE
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view trailers" ON trailers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view trailers" 
ON trailers FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'afterhours'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);