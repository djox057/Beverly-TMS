-- Step 2: Update RLS policies for driver role support

-- Drop existing policies that will be recreated
DROP POLICY IF EXISTS "Dispatch, managers and admins can view drivers" ON public.drivers;
DROP POLICY IF EXISTS "Dispatch, managers and admins can view trucks" ON public.trucks;
DROP POLICY IF EXISTS "Dispatch, managers and admins can view trailers" ON public.trailers;
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can view companies" ON public.companies;

-- Drivers table: Allow drivers to view their own profile
CREATE POLICY "Drivers can view their own profile" 
ON public.drivers 
FOR SELECT 
USING (
  auth.uid() IN (
    SELECT user_id FROM profiles WHERE email = drivers.email AND role = 'driver'
  )
);

CREATE POLICY "Dispatch, managers and admins can view drivers" 
ON public.drivers 
FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Trucks table: Allow drivers to view trucks they're assigned to
CREATE POLICY "Drivers can view their assigned trucks" 
ON public.trucks 
FOR SELECT 
USING (
  driver1_id IN (
    SELECT d.id FROM drivers d 
    JOIN profiles p ON p.email = d.email 
    WHERE p.user_id = auth.uid() AND p.role = 'driver'
  ) OR 
  driver2_id IN (
    SELECT d.id FROM drivers d 
    JOIN profiles p ON p.email = d.email 
    WHERE p.user_id = auth.uid() AND p.role = 'driver'
  )
);

CREATE POLICY "Dispatch, managers and admins can view trucks" 
ON public.trucks 
FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Trailers table: Allow drivers to view trailers attached to their trucks
CREATE POLICY "Drivers can view trailers on their trucks" 
ON public.trailers 
FOR SELECT 
USING (
  id IN (
    SELECT trailer_id FROM trucks 
    WHERE driver1_id IN (
      SELECT d.id FROM drivers d 
      JOIN profiles p ON p.email = d.email 
      WHERE p.user_id = auth.uid() AND p.role = 'driver'
    ) OR 
    driver2_id IN (
      SELECT d.id FROM drivers d 
      JOIN profiles p ON p.email = d.email 
      WHERE p.user_id = auth.uid() AND p.role = 'driver'
    )
  )
);

CREATE POLICY "Dispatch, managers and admins can view trailers" 
ON public.trailers 
FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Orders table: Allow drivers to view their orders
CREATE POLICY "Drivers can view their own orders" 
ON public.orders 
FOR SELECT 
USING (
  driver1_id IN (
    SELECT d.id FROM drivers d 
    JOIN profiles p ON p.email = d.email 
    WHERE p.user_id = auth.uid() AND p.role = 'driver'
  ) OR 
  driver2_id IN (
    SELECT d.id FROM drivers d 
    JOIN profiles p ON p.email = d.email 
    WHERE p.user_id = auth.uid() AND p.role = 'driver'
  )
);

CREATE POLICY "Dispatch, managers and admins can view orders" 
ON public.orders 
FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Companies table: Allow drivers to view their company
CREATE POLICY "Drivers can view their company" 
ON public.companies 
FOR SELECT 
USING (
  id IN (
    SELECT company_id FROM trucks 
    WHERE driver1_id IN (
      SELECT d.id FROM drivers d 
      JOIN profiles p ON p.email = d.email 
      WHERE p.user_id = auth.uid() AND p.role = 'driver'
    ) OR 
    driver2_id IN (
      SELECT d.id FROM drivers d 
      JOIN profiles p ON p.email = d.email 
      WHERE p.user_id = auth.uid() AND p.role = 'driver'
    )
  )
);

CREATE POLICY "Dispatch, managers and admins can view companies" 
ON public.companies 
FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Pickup drops: Allow drivers to view pickup/drop info for their orders
CREATE POLICY "Drivers can view pickup drops for their orders" 
ON public.pickup_drops 
FOR SELECT 
USING (
  order_id IN (
    SELECT o.id FROM orders o
    WHERE o.driver1_id IN (
      SELECT d.id FROM drivers d 
      JOIN profiles p ON p.email = d.email 
      WHERE p.user_id = auth.uid() AND p.role = 'driver'
    ) OR 
    o.driver2_id IN (
      SELECT d.id FROM drivers d 
      JOIN profiles p ON p.email = d.email 
      WHERE p.user_id = auth.uid() AND p.role = 'driver'
    )
  )
);

-- Brokers: Allow drivers to view broker info for their orders
CREATE POLICY "Drivers can view brokers for their orders" 
ON public.brokers 
FOR SELECT 
USING (
  id IN (
    SELECT broker_id FROM orders 
    WHERE driver1_id IN (
      SELECT d.id FROM drivers d 
      JOIN profiles p ON p.email = d.email 
      WHERE p.user_id = auth.uid() AND p.role = 'driver'
    ) OR 
    driver2_id IN (
      SELECT d.id FROM drivers d 
      JOIN profiles p ON p.email = d.email 
      WHERE p.user_id = auth.uid() AND p.role = 'driver'
    )
  )
);

-- Profiles: Drivers can update their own profile (for password changes)
CREATE POLICY "Drivers can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (
  auth.uid() = user_id AND role = 'driver'
);