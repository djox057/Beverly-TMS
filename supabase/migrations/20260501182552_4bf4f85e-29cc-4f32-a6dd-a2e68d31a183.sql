-- Drop dependent policy temporarily
DROP POLICY IF EXISTS "Supervisors can view office analytics" ON public.analytics_dispatcher_period;

-- 1. Create new enum
CREATE TYPE public.office_location_new AS ENUM ('Čačak', 'KRAGUJEVAC', 'BG 1st floor', 'BG 2nd floor', 'Recovery');

-- 2. Alter profiles.office to use new enum (mapping BEOGRAD -> BG 1st floor)
ALTER TABLE public.profiles
  ALTER COLUMN office TYPE public.office_location_new
  USING (
    CASE office::text
      WHEN 'BEOGRAD' THEN 'BG 1st floor'::public.office_location_new
      ELSE office::text::public.office_location_new
    END
  );

-- 3. Drop old enum and rename new one
DROP TYPE public.office_location;
ALTER TYPE public.office_location_new RENAME TO office_location;

-- 4. Recreate the policy
CREATE POLICY "Supervisors can view office analytics"
ON public.analytics_dispatcher_period
FOR SELECT
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND (office = (SELECT (profiles.office)::text FROM profiles WHERE profiles.user_id = auth.uid()))
);

-- 5. Reassign specific users to BG 2nd floor
UPDATE public.profiles
SET office = 'BG 2nd floor'::public.office_location
WHERE user_id IN (
  '7503d518-e115-4218-a7a7-fc32b205b747', -- Kate
  '36d29f2b-c14f-4fc5-b5e8-7f2deeb46af9', -- Vince
  '03c1e107-4f66-4a01-9138-64fdbdcefb42', -- Vincent
  '82a925ef-488e-4e06-8285-917f32d086e1', -- Hunter
  'd3632b3f-b65c-42a8-a134-59b7d94f1dc1', -- Sam
  'a0c9365c-f657-4750-baa8-af869fadfe60', -- Cary
  '82308d76-bdbf-4540-81dc-296fabd65d98', -- Mack
  '5d605e46-3f08-4162-821e-c8e5cea989e4', -- Alexa
  '06034793-9624-4190-9f73-9d1ae2bae99a', -- Conor
  'c0a01ab9-b8ce-49f5-bc0b-b77c19a63942'  -- Dominic
);