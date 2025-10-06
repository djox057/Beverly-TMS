-- Drop the ineffective RESTRICTIVE policy that blocks all access
DROP POLICY IF EXISTS "Block all unauthenticated access to profiles" ON public.profiles;

-- The existing PERMISSIVE policies already properly control access:
-- 1. "Admins can view all profiles" - allows admins full access
-- 2. "Dispatchers can view other dispatchers" - allows dispatchers to view other dispatchers
-- 3. "Users can view their own profile" - allows users to view their own profile
-- 4. "Drivers can update their own profile" - allows drivers to update their own
-- 5. "Users can update own profile except role" - allows users to update their profile
-- 6. "Users can insert their own profile with limited roles" - allows users to create their profile

-- Since RLS is enabled and no policies grant access to the 'anon' role,
-- unauthenticated users are automatically blocked from all operations.
-- The PERMISSIVE policies only allow authenticated users with auth.uid() checks.