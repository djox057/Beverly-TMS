-- Step 1: Delete all user_roles records with maintenance role
DELETE FROM public.user_roles WHERE role = 'maintenance';

-- Step 2: Drop the has_role function (will be recreated automatically)
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;

-- Step 3: Create new enum without maintenance
CREATE TYPE public.app_role_new AS ENUM ('dispatch', 'admin', 'manager', 'driver', 'safety', 'supervisor', 'accounting');

-- Step 4: Update user_roles table to use new enum
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role_new USING role::text::public.app_role_new;

-- Step 5: Drop old enum
DROP TYPE public.app_role CASCADE;

-- Step 6: Rename new enum
ALTER TYPE public.app_role_new RENAME TO app_role;

-- Step 7: Recreate the has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;