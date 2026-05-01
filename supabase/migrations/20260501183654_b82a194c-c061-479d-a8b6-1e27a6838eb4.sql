-- Replace office_location enum: rename "BG 2nd floor" -> "BG 4th floor"

DROP POLICY IF EXISTS "Supervisors can view office analytics" ON public.analytics_dispatcher_period;

CREATE TYPE public.office_location_new AS ENUM ('Čačak', 'KRAGUJEVAC', 'BG 1st floor', 'BG 4th floor', 'Recovery');

ALTER TABLE public.profiles
  ALTER COLUMN office TYPE public.office_location_new
  USING (
    CASE office::text
      WHEN 'BG 2nd floor' THEN 'BG 4th floor'::public.office_location_new
      ELSE office::text::public.office_location_new
    END
  );

DROP TYPE public.office_location;
ALTER TYPE public.office_location_new RENAME TO office_location;

CREATE POLICY "Supervisors can view office analytics"
ON public.analytics_dispatcher_period
FOR SELECT
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND (office = (SELECT (profiles.office)::text FROM profiles WHERE profiles.user_id = auth.uid()))
);