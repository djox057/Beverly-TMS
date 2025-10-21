-- Allow all authenticated users to delete truck notes
DROP POLICY IF EXISTS "Managers, admins and accounting can delete truck notes" ON public.truck_notes;

CREATE POLICY "All authenticated users can delete truck notes" 
ON public.truck_notes FOR DELETE 
USING (auth.uid() IS NOT NULL);