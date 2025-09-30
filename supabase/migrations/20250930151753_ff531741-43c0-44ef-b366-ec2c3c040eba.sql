-- Update trucks SELECT policy to allow dispatch role to view
DROP POLICY IF EXISTS "Managers and admins can view trucks" ON public.trucks;
CREATE POLICY "Dispatch, managers and admins can view trucks" ON public.trucks
FOR SELECT USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Update trailers SELECT policy to allow dispatch role to view
DROP POLICY IF EXISTS "Managers and admins can view trailers" ON public.trailers;
CREATE POLICY "Dispatch, managers and admins can view trailers" ON public.trailers
FOR SELECT USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Update drivers SELECT policy to allow dispatch role to view
DROP POLICY IF EXISTS "Managers and admins can view drivers" ON public.drivers;
CREATE POLICY "Dispatch, managers and admins can view drivers" ON public.drivers
FOR SELECT USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);