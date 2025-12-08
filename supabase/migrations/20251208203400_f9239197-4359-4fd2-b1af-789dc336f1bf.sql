-- Allow accounting role to update drivers
CREATE POLICY "Accounting can update drivers"
ON public.drivers
FOR UPDATE
USING (has_role((SELECT auth.uid()), 'accounting'::app_role));