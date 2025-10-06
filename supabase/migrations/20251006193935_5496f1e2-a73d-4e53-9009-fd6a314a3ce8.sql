-- Remove dual role storage - Comprehensive update of all policies
-- This migration updates ALL policies that reference profiles.role to use has_role() function

-- Step 1: Update drivers table policies
DROP POLICY IF EXISTS "Drivers can view their own profile" ON public.drivers;
CREATE POLICY "Drivers can view their own profile" 
ON public.drivers 
FOR SELECT 
USING (
  auth.uid() IN (
    SELECT profiles.user_id
    FROM profiles
    WHERE profiles.email = drivers.email
      AND has_role(profiles.user_id, 'driver'::app_role)
  )
);

-- Step 2: Update orders table policies  
DROP POLICY IF EXISTS "Drivers can view their own orders" ON public.orders;
CREATE POLICY "Drivers can view their own orders"
ON public.orders
FOR SELECT
USING (
  (driver1_id IN (
    SELECT d.id
    FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
  )) OR (driver2_id IN (
    SELECT d.id
    FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
  ))
);

-- Step 3: Update pickup_drops table policies
DROP POLICY IF EXISTS "Drivers can view pickup drops for their orders" ON public.pickup_drops;
CREATE POLICY "Drivers can view pickup drops for their orders"
ON public.pickup_drops
FOR SELECT
USING (
  order_id IN (
    SELECT o.id
    FROM orders o
    WHERE (o.driver1_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )) OR (o.driver2_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    ))
  )
);

-- Step 4: Update profiles table policies
DROP POLICY IF EXISTS "Drivers can update their own profile" ON public.profiles;
CREATE POLICY "Drivers can update their own profile"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() = user_id AND has_role(auth.uid(), 'driver'::app_role)
);

DROP POLICY IF EXISTS "Dispatchers can view other dispatchers" ON public.profiles;
CREATE POLICY "Dispatchers can view other dispatchers" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) 
  AND has_role(user_id, 'dispatch'::app_role)
);

DROP POLICY IF EXISTS "Users can insert their own profile with limited roles" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile except role" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 5: Update trucks table policies
DROP POLICY IF EXISTS "Drivers can view their assigned trucks" ON public.trucks;
CREATE POLICY "Drivers can view their assigned trucks"
ON public.trucks
FOR SELECT
USING (
  driver1_id IN (
    SELECT d.id
    FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
  )
);

-- Step 6: Update trailers table policies
DROP POLICY IF EXISTS "Drivers can view trailers on their trucks" ON public.trailers;
CREATE POLICY "Drivers can view trailers on their trucks"
ON public.trailers
FOR SELECT
USING (
  id IN (
    SELECT trucks.trailer_id
    FROM trucks
    WHERE trucks.driver1_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  )
);

-- Step 7: Update companies table policies
DROP POLICY IF EXISTS "Drivers can view their company" ON public.companies;
CREATE POLICY "Drivers can view their company"
ON public.companies
FOR SELECT
USING (
  id IN (
    SELECT trucks.company_id
    FROM trucks
    WHERE trucks.driver1_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  )
);

-- Step 8: Update order_files table policies
DROP POLICY IF EXISTS "Drivers can view files for their orders" ON public.order_files;
CREATE POLICY "Drivers can view files for their orders"
ON public.order_files
FOR SELECT
USING (
  order_id IN (
    SELECT o.id
    FROM orders o
    WHERE (o.driver1_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )) OR (o.driver2_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    ))
  )
);

-- Step 9: Update truck_files table policies
DROP POLICY IF EXISTS "Drivers can view their truck files" ON public.truck_files;
CREATE POLICY "Drivers can view their truck files"
ON public.truck_files
FOR SELECT
USING (
  truck_id IN (
    SELECT trucks.id
    FROM trucks
    WHERE trucks.driver1_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  )
);

-- Step 10: Update trailer_files table policies
DROP POLICY IF EXISTS "Drivers can view their trailer files" ON public.trailer_files;
CREATE POLICY "Drivers can view their trailer files"
ON public.trailer_files
FOR SELECT
USING (
  trailer_id IN (
    SELECT trucks.trailer_id
    FROM trucks
    WHERE trucks.driver1_id IN (
      SELECT d.id
      FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  )
);

-- Step 11: Update storage policies (if they exist)
DROP POLICY IF EXISTS "Drivers can view their order files" ON storage.objects;
-- Note: Storage policy recreation may need to be handled separately via Supabase dashboard

-- Step 12: Drop trigger that depends on role column
DROP TRIGGER IF EXISTS on_driver_profile_created ON public.profiles;
DROP FUNCTION IF EXISTS public.create_driver_from_profile() CASCADE;

-- Recreate the trigger function without role reference
CREATE OR REPLACE FUNCTION public.create_driver_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only create driver if they have driver role and no driver exists with this email
  IF NEW.email IS NOT NULL AND has_role(NEW.user_id, 'driver'::app_role) THEN
    INSERT INTO public.drivers (name, email)
    VALUES (
      COALESCE(NEW.full_name, NEW.email),
      NEW.email
    )
    ON CONFLICT (email) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_driver_profile_created
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_driver_from_profile();

-- Step 13: Update handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Extract role from metadata, default to 'dispatch'
  user_role := COALESCE((NEW.raw_user_meta_data ->> 'role')::app_role, 'dispatch'::app_role);
  
  -- SECURITY: For self-signup, restrict to dispatch and driver roles only
  IF NOT NEW.email_confirmed_at IS NOT NULL AND user_role IN ('admin', 'manager', 'safety') THEN
    user_role := 'dispatch'::app_role;
  END IF;
  
  -- Insert into profiles WITHOUT role column
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  -- Add to user_roles table (single source of truth)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$$;

-- Step 14: Finally, drop the role column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role CASCADE;