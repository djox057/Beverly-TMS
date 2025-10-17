-- Fix RLS policies for driver_termination_notes to allow dispatch and afterhours roles

-- Drop existing policies
DROP POLICY IF EXISTS "Managers, admins and accounting can view termination notes" ON public.driver_termination_notes;
DROP POLICY IF EXISTS "Managers, admins and accounting can create termination notes" ON public.driver_termination_notes;
DROP POLICY IF EXISTS "Safety can view termination notes" ON public.driver_termination_notes;
DROP POLICY IF EXISTS "Supervisors can view termination notes" ON public.driver_termination_notes;
DROP POLICY IF EXISTS "Supervisors can create termination notes" ON public.driver_termination_notes;

-- Create new comprehensive policies
CREATE POLICY "Dispatch and higher roles can view termination notes"
  ON public.driver_termination_notes
  FOR SELECT
  USING (
    has_role(auth.uid(), 'dispatch'::app_role) OR
    has_role(auth.uid(), 'afterhours'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'accounting'::app_role) OR
    has_role(auth.uid(), 'safety'::app_role)
  );

CREATE POLICY "Dispatch and higher roles can create termination notes"
  ON public.driver_termination_notes
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'dispatch'::app_role) OR
    has_role(auth.uid(), 'afterhours'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'accounting'::app_role)
  );

CREATE POLICY "Managers, admins and accounting can delete termination notes"
  ON public.driver_termination_notes
  FOR DELETE
  USING (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'accounting'::app_role)
  );