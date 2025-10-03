-- Fix handle_new_user to allow admin-created users to have privileged roles
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
  
  -- SECURITY: For self-signup (email not confirmed by admin), restrict to dispatch and driver roles only
  -- Admin-created users (email_confirm=true) can have any role
  IF NOT NEW.email_confirmed_at IS NOT NULL AND user_role IN ('admin', 'manager', 'safety') THEN
    user_role := 'dispatch'::app_role;
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