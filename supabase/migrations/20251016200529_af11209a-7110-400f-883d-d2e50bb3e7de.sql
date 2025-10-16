-- Add afterhours role to trucks table RLS policies

-- Allow afterhours to view trucks (same as dispatch)
CREATE POLICY "Afterhours can view all trucks"
ON public.trucks
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'afterhours'::app_role));

-- Allow afterhours to create trucks (same as dispatch)
CREATE POLICY "Afterhours can create trucks"
ON public.trucks
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'afterhours'::app_role));

-- Allow afterhours to update trucks (same as dispatch)
CREATE POLICY "Afterhours can update trucks"
ON public.trucks
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'afterhours'::app_role))
WITH CHECK (has_role(auth.uid(), 'afterhours'::app_role));

-- Add afterhours role to dispatcher_status table RLS policies for viewing
CREATE POLICY "Afterhours can view dispatcher status"
ON public.dispatcher_status
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'afterhours'::app_role));