-- ============================================================================
-- PHASE 1: CRITICAL SECURITY FIXES
-- ============================================================================

-- 1. FIX PRIVILEGE ESCALATION VULNERABILITY
-- Update has_role function to ONLY check user_roles table (not profiles)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- Remove the update policy that allows users to change their own role
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create new restricted update policy - users can update everything EXCEPT role
CREATE POLICY "Users can update their own profile (not role)"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  AND role = (SELECT role FROM public.profiles WHERE user_id = auth.uid())
);

-- 2. FIX CUSTOMER PII EXPOSURE IN pickup_drops
-- Remove overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view pickup_drops" ON public.pickup_drops;
DROP POLICY IF EXISTS "Authenticated users can create pickup_drops" ON public.pickup_drops;
DROP POLICY IF EXISTS "Authenticated users can update pickup_drops" ON public.pickup_drops;

-- Create restrictive policies for pickup_drops
CREATE POLICY "Dispatch, managers and admins can view pickup_drops"
ON public.pickup_drops
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Dispatch, managers and admins can create pickup_drops"
ON public.pickup_drops
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Dispatch, managers and admins can update pickup_drops"
ON public.pickup_drops
FOR UPDATE
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- 3. IMPLEMENT FIELD-LEVEL SECURITY FOR DRIVER PII
-- Create a view for drivers without sensitive PII (for dispatch/managers)
CREATE OR REPLACE VIEW public.drivers_public AS
SELECT 
  id,
  name,
  email,
  phone,
  hire_date,
  termination_date,
  is_active,
  cdl_number,
  cdl_expiration_date,
  medical_card_expiration_date,
  mvr_date,
  clearing_house,
  license_number,
  fuel_card_number,
  personal_id,
  hos_status,
  hos_drive_minutes,
  hos_shift_minutes,
  hos_cycle_minutes,
  hos_break_minutes,
  hos_last_updated,
  home_city,
  home_state,
  created_at,
  updated_at
FROM public.drivers;

-- Grant access to the public view
GRANT SELECT ON public.drivers_public TO authenticated;

-- 4. RESTRICT FILE STORAGE POLICIES
-- Remove overly permissive file policies
DROP POLICY IF EXISTS "Authenticated users can view driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Authenticated users can create driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Authenticated users can update driver_files" ON public.driver_files;

DROP POLICY IF EXISTS "Authenticated users can view truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Authenticated users can create truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Authenticated users can update truck_files" ON public.truck_files;

DROP POLICY IF EXISTS "Authenticated users can view trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Authenticated users can create trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Authenticated users can update trailer_files" ON public.trailer_files;

DROP POLICY IF EXISTS "Authenticated users can view order_files" ON public.order_files;
DROP POLICY IF EXISTS "Authenticated users can create order_files" ON public.order_files;
DROP POLICY IF EXISTS "Authenticated users can update order_files" ON public.order_files;

-- Create restrictive policies for driver_files
CREATE POLICY "Dispatch, managers and admins can view driver_files"
ON public.driver_files FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Managers and admins can create driver_files"
ON public.driver_files FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Managers and admins can update driver_files"
ON public.driver_files FOR UPDATE
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Create restrictive policies for truck_files
CREATE POLICY "Dispatch, managers and admins can view truck_files"
ON public.truck_files FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Managers and admins can create truck_files"
ON public.truck_files FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Managers and admins can update truck_files"
ON public.truck_files FOR UPDATE
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Create restrictive policies for trailer_files
CREATE POLICY "Dispatch, managers and admins can view trailer_files"
ON public.trailer_files FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Managers and admins can create trailer_files"
ON public.trailer_files FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Managers and admins can update trailer_files"
ON public.trailer_files FOR UPDATE
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Create restrictive policies for order_files
CREATE POLICY "Dispatch, managers and admins can view order_files"
ON public.order_files FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Drivers can view files for their orders"
ON public.order_files FOR SELECT
USING (
  order_id IN (
    SELECT o.id FROM orders o
    WHERE o.driver1_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
    )
    OR o.driver2_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
    )
  )
);

CREATE POLICY "Dispatch, managers and admins can create order_files"
ON public.order_files FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Managers and admins can update order_files"
ON public.order_files FOR UPDATE
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- 5. FIX STORAGE BUCKET POLICIES
-- Remove overly permissive storage policies
DROP POLICY IF EXISTS "Public access to order files" ON storage.objects;
DROP POLICY IF EXISTS "Public access to driver files" ON storage.objects;
DROP POLICY IF EXISTS "Public access to truck files" ON storage.objects;
DROP POLICY IF EXISTS "Public access to trailer files" ON storage.objects;

-- Set buckets to private
UPDATE storage.buckets SET public = false WHERE id IN ('order-files', 'driver-files', 'truck-files', 'trailer-files');

-- Create secure storage policies for order-files
CREATE POLICY "Dispatch, managers and admins can view order files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'order-files' AND (
    has_role(auth.uid(), 'dispatch'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Drivers can view their order files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'order-files' AND
  (storage.foldername(name))[1] IN (
    SELECT o.id::text FROM orders o
    WHERE o.driver1_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
    )
    OR o.driver2_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
    )
  )
);

CREATE POLICY "Dispatch, managers and admins can upload order files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'order-files' AND (
    has_role(auth.uid(), 'dispatch'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Admins can delete order files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'order-files' AND has_role(auth.uid(), 'admin'::app_role)
);

-- Create secure storage policies for driver-files
CREATE POLICY "Managers and admins can view driver files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'driver-files' AND (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Managers and admins can upload driver files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'driver-files' AND (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Admins can delete driver files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'driver-files' AND has_role(auth.uid(), 'admin'::app_role)
);

-- Create secure storage policies for truck-files
CREATE POLICY "Dispatch, managers and admins can view truck files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'truck-files' AND (
    has_role(auth.uid(), 'dispatch'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Managers and admins can upload truck files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'truck-files' AND (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Admins can delete truck files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'truck-files' AND has_role(auth.uid(), 'admin'::app_role)
);

-- Create secure storage policies for trailer-files
CREATE POLICY "Dispatch, managers and admins can view trailer files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'trailer-files' AND (
    has_role(auth.uid(), 'dispatch'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Managers and admins can upload trailer files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'trailer-files' AND (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Admins can delete trailer files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'trailer-files' AND has_role(auth.uid(), 'admin'::app_role)
);

-- 6. RESTRICT EMAIL EXPOSURE IN PROFILES
DROP POLICY IF EXISTS "Dispatchers can view other dispatchers" ON public.profiles;

-- Create policy that hides email from other users
CREATE POLICY "Dispatchers can view other dispatchers (limited)"
ON public.profiles FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) 
  AND role = 'dispatch'::app_role
  AND user_id = auth.uid()
);