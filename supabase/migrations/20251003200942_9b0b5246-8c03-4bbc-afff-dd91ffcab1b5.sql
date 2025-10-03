-- Update handle_new_user function to support safety role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Extract role from metadata, default to 'dispatch'
  user_role := COALESCE((NEW.raw_user_meta_data ->> 'role')::app_role, 'dispatch'::app_role);
  
  -- SECURITY: Restrict self-signup to only dispatch and driver roles
  -- Admin, manager, and safety roles can only be set by existing admins
  IF user_role IN ('admin', 'manager', 'safety') THEN
    -- Check if this is being created by an admin (via edge function with service role)
    -- If not, force to dispatch role
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      user_role := 'dispatch'::app_role;
    END IF;
  END IF;
  
  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    user_role
  );
  
  -- Add to user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$$;

-- Add RLS policies for safety role with view-only permissions
CREATE POLICY "Safety can view orders" 
ON public.orders 
FOR SELECT 
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view trucks" 
ON public.trucks 
FOR SELECT 
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view trailers" 
ON public.trailers 
FOR SELECT 
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view drivers" 
ON public.drivers 
FOR SELECT 
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view driver sensitive PII"
ON public.driver_sensitive_pii
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view PII audit logs"
ON public.driver_pii_audit_log
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view truck notes"
ON public.truck_notes
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view truck files"
ON public.truck_files
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view trailer files"
ON public.trailer_files
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view driver files"
ON public.driver_files
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view order files"
ON public.order_files
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view brokers"
ON public.brokers
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view companies"
ON public.companies
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view pickup drops"
ON public.pickup_drops
FOR SELECT
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can view lost day notes"
ON public.lost_day_notes
FOR SELECT
USING (has_role(auth.uid(), 'safety'));