-- Allow maintenance role to delete yard arrivals
CREATE POLICY "Maintenance can delete yard arrivals"
ON public.driver_yard_actions
FOR DELETE
USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));