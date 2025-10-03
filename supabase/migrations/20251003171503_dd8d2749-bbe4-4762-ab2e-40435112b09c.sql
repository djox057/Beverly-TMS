-- ================================================================
-- PHASE 1: CRITICAL SECURITY FIXES (Part 1 of 2)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. FIX CONFLICTING STORAGE POLICIES ON order-files BUCKET
-- ----------------------------------------------------------------
-- Drop the three overly permissive policies that allow any authenticated user full access
DROP POLICY IF EXISTS "Allow all uploads to order-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow all users to delete order files" ON storage.objects;
DROP POLICY IF EXISTS "Allow all users to view order files" ON storage.objects;

-- The restrictive policies remain:
-- - "Dispatch, managers and admins can upload order files"
-- - "Dispatch, managers and admins can view order files"  
-- - "Admins can delete order files"
-- - "Drivers can view their order files"

-- ----------------------------------------------------------------
-- 2. REMOVE drivers_public VIEW (Cannot Have RLS Policies)
-- ----------------------------------------------------------------
-- Views cannot have RLS policies directly. The WHERE clause alone is not sufficient security.
-- Users should access the drivers table directly with proper RLS policies.
DROP VIEW IF EXISTS public.drivers_public;

-- ----------------------------------------------------------------
-- 3. RESTRICT ACCESS TO truck_notes AND lost_day_notes
-- ----------------------------------------------------------------
-- Replace overly permissive policies that allow all authenticated users

-- Drop existing permissive policies for truck_notes
DROP POLICY IF EXISTS "Authenticated users can view truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Authenticated users can create truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Authenticated users can update truck notes" ON public.truck_notes;

-- Create role-based policies for truck_notes
CREATE POLICY "Dispatch, managers and admins can view truck notes"
ON public.truck_notes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Dispatch, managers and admins can create truck notes"
ON public.truck_notes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Dispatch, managers and admins can update truck notes"
ON public.truck_notes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Drop existing permissive policies for lost_day_notes
DROP POLICY IF EXISTS "Authenticated users can view lost day notes" ON public.lost_day_notes;
DROP POLICY IF EXISTS "Authenticated users can create lost day notes" ON public.lost_day_notes;
DROP POLICY IF EXISTS "Authenticated users can update lost day notes" ON public.lost_day_notes;

-- Create role-based policies for lost_day_notes
CREATE POLICY "Dispatch, managers and admins can view lost day notes"
ON public.lost_day_notes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Dispatch, managers and admins can create lost day notes"
ON public.lost_day_notes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Dispatch, managers and admins can update lost day notes"
ON public.lost_day_notes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);