-- Fix RLS policies to block all unauthenticated access
-- Only authenticated users with proper roles can access data

-- ============================================
-- PROFILES TABLE
-- ============================================
-- Drop any existing public SELECT policies and ensure authentication required
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Ensure only authenticated users can view profiles
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- ============================================
-- DRIVERS TABLE
-- ============================================
-- Drop any public SELECT policies
DROP POLICY IF EXISTS "Public can view drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers are viewable by everyone" ON public.drivers;

-- All existing role-based SELECT policies are fine, just ensure no public access
-- (The existing policies already use has_role which requires authentication)

-- ============================================
-- DRIVER_SENSITIVE_PII TABLE
-- ============================================
-- Drop any public SELECT policies
DROP POLICY IF EXISTS "Public can view driver sensitive PII" ON public.driver_sensitive_pii;
DROP POLICY IF EXISTS "Driver sensitive PII is viewable by everyone" ON public.driver_sensitive_pii;

-- The existing policies are already restrictive (managers/admins/accounting only)
-- No changes needed beyond removing public policies

-- ============================================
-- ORDERS TABLE
-- ============================================
-- Drop any public SELECT policies
DROP POLICY IF EXISTS "Public can view orders" ON public.orders;
DROP POLICY IF EXISTS "Orders are viewable by everyone" ON public.orders;

-- Drop any public INSERT policies
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;

-- Replace the overly permissive "Authenticated users can create orders" policy
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;

-- Add proper INSERT policies for orders (only dispatch and higher roles)
CREATE POLICY "Dispatch and higher roles can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- ============================================
-- PICKUP_DROPS TABLE
-- ============================================
-- Drop any public policies
DROP POLICY IF EXISTS "Public can view pickup_drops" ON public.pickup_drops;
DROP POLICY IF EXISTS "Pickup drops are viewable by everyone" ON public.pickup_drops;

-- ============================================
-- TRUCK_LOCATIONS TABLE
-- ============================================
-- Enable RLS on truck_locations (it appears to have none)
ALTER TABLE public.truck_locations ENABLE ROW LEVEL SECURITY;

-- Add restrictive policies for truck_locations
-- Only dispatch, managers, admins, accounting, safety, and supervisors can view
CREATE POLICY "Dispatch and higher roles can view truck locations"
ON public.truck_locations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- Only system/admin can insert truck locations
CREATE POLICY "Admins can insert truck locations"
ON public.truck_locations
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role)
);

-- ============================================
-- BROKERS TABLE
-- ============================================
DROP POLICY IF EXISTS "Public can view brokers" ON public.brokers;

-- ============================================
-- COMPANIES TABLE
-- ============================================
DROP POLICY IF EXISTS "Public can view companies" ON public.companies;
DROP POLICY IF EXISTS "Public can create companies" ON public.companies;

-- Replace overly permissive "Authenticated users can create companies"
DROP POLICY IF EXISTS "Authenticated users can create companies" ON public.companies;

CREATE POLICY "Dispatch and higher roles can create companies"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role) OR
  has_role(auth.uid(), 'safety'::app_role)
);

-- ============================================
-- TRAILERS TABLE
-- ============================================
DROP POLICY IF EXISTS "Public can view trailers" ON public.trailers;

-- ============================================
-- TRUCKS TABLE
-- ============================================
DROP POLICY IF EXISTS "Public can view trucks" ON public.trucks;

-- ============================================
-- ORDER_FILES TABLE
-- ============================================
DROP POLICY IF EXISTS "Public can view order_files" ON public.order_files;

-- ============================================
-- DRIVER_FILES TABLE
-- ============================================
DROP POLICY IF EXISTS "Public can view driver_files" ON public.driver_files;

-- ============================================
-- TRUCK_FILES TABLE
-- ============================================
DROP POLICY IF EXISTS "Public can view truck_files" ON public.truck_files;

-- ============================================
-- TRAILER_FILES TABLE (if exists)
-- ============================================
DROP POLICY IF EXISTS "Public can view trailer_files" ON public.trailer_files;

-- Summary: All tables now require authentication
-- Unauthenticated users can only access auth endpoints (login/signup)