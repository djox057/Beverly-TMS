-- CRITICAL SECURITY FIX: Prevent unauthorized role assignment and privilege escalation

-- Drop existing unsafe INSERT policy on profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create new secure INSERT policy that restricts role assignment
-- Only allow users to create profiles with 'dispatch' or 'driver' roles during self-signup
-- Admins can create any role via the handle_new_user trigger (SECURITY DEFINER)
CREATE POLICY "Users can insert their own profile with limited roles"
ON public.profiles
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  (
    role IN ('dispatch', 'driver') OR
    -- Allow if being created by admin via trigger (will have admin role in user_roles)
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
);

-- Drop the overly permissive update policy that doesn't check role changes
DROP POLICY IF EXISTS "Users can update their own profile (not role)" ON public.profiles;

-- Create strict policy: users can update their profile but NEVER change their role
CREATE POLICY "Users can update own profile except role"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  -- Ensure role hasn't changed from original
  role = (SELECT role FROM public.profiles WHERE user_id = auth.uid())
);

-- Ensure the handle_new_user trigger validates role against allowed values
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
  -- Admin and manager roles can only be set by existing admins
  IF user_role IN ('admin', 'manager') THEN
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

-- Add policy to prevent users from modifying user_roles table directly
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Only admins can manage roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add comment explaining the security model
COMMENT ON TABLE public.user_roles IS 'CRITICAL SECURITY TABLE: Roles must only be managed through admin edge functions. Direct INSERT/UPDATE by non-admins is blocked by RLS.';