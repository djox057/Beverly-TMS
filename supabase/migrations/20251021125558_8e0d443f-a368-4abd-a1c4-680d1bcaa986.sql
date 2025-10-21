-- Allow all authenticated users to create, update and view truck notes
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can create truck note" ON public.truck_notes;
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Managers, admins and accounting can update truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Managers, admins and accounting can delete truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Supervisors can create truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Supervisors can update truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Supervisors can view truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Safety can view truck notes" ON public.truck_notes;

-- Create new policies allowing all authenticated users to work with truck notes
CREATE POLICY "All authenticated users can view truck notes" 
ON public.truck_notes FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "All authenticated users can create truck notes" 
ON public.truck_notes FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "All authenticated users can update truck notes" 
ON public.truck_notes FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Keep delete restricted to managers, admins and accounting
CREATE POLICY "Managers, admins and accounting can delete truck notes" 
ON public.truck_notes FOR DELETE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));