-- Allow accounting role to delete driver_yard_actions (yard reports)
CREATE POLICY "Accounting can delete driver yard actions"
ON public.driver_yard_actions
FOR DELETE
USING (has_role((SELECT auth.uid()), 'accounting'::app_role));