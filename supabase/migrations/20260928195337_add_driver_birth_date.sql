ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS birth_date date;

-- Date of birth must not be exposed through the existing anonymous SELECT policy.
-- Authenticated staff and drivers retain their role/own-profile SELECT policies.
DROP POLICY IF EXISTS "Anon can view drivers" ON public.drivers;
