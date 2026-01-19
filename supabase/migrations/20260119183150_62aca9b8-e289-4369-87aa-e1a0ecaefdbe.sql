-- Allow safety role to view dispatcher status (read-only)
CREATE POLICY "Safety can view dispatcher status"
ON public.dispatcher_status
FOR SELECT
USING (public.has_role(auth.uid(), 'safety'::app_role));