CREATE OR REPLACE FUNCTION public.is_recovery_dispatcher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_recovery = true
  ) AND public.has_role(auth.uid(), 'dispatch'::app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.is_recovery_dispatcher() FROM anon;

CREATE POLICY "Recovery dispatchers can delete driver_yard_actions"
ON public.driver_yard_actions
FOR DELETE
TO authenticated
USING (public.is_recovery_dispatcher());

CREATE POLICY "Recovery dispatchers can update trucks"
ON public.trucks
FOR UPDATE
TO authenticated
USING (public.is_recovery_dispatcher())
WITH CHECK (public.is_recovery_dispatcher());