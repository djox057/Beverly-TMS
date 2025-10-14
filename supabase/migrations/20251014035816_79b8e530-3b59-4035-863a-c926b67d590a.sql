-- Fix supervisor role not being able to insert pickup_drops
-- The issue is that supervisor is included in a complex OR condition that may not be evaluating correctly
-- Create a separate explicit policy for supervisor to ensure it works independently

-- First, let's see the current policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'pickup_drops' AND cmd = 'INSERT';

-- Drop the existing combined policy
DROP POLICY IF EXISTS "Authorized roles can create pickup_drops" ON public.pickup_drops;

-- Create separate, explicit policies for each role to avoid OR condition issues
CREATE POLICY "Dispatch can create pickup_drops" 
ON public.pickup_drops 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role));

CREATE POLICY "Manager can create pickup_drops" 
ON public.pickup_drops 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admin can create pickup_drops" 
ON public.pickup_drops 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accounting can create pickup_drops" 
ON public.pickup_drops 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Supervisor can create pickup_drops" 
ON public.pickup_drops 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));