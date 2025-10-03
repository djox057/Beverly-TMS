-- Move home information from sensitive PII to drivers table
ALTER TABLE public.drivers
ADD COLUMN home_address text,
ADD COLUMN home_city text,
ADD COLUMN home_state text,
ADD COLUMN home_latitude numeric,
ADD COLUMN home_longitude numeric;

-- Migrate existing data from driver_sensitive_pii to drivers
UPDATE public.drivers d
SET 
  home_address = dsp.home_address,
  home_city = dsp.home_city,
  home_state = dsp.home_state,
  home_latitude = dsp.home_latitude,
  home_longitude = dsp.home_longitude
FROM public.driver_sensitive_pii dsp
WHERE d.id = dsp.driver_id;

-- Remove home columns from driver_sensitive_pii
ALTER TABLE public.driver_sensitive_pii
DROP COLUMN home_address,
DROP COLUMN home_city,
DROP COLUMN home_state,
DROP COLUMN home_latitude,
DROP COLUMN home_longitude;

-- Drop existing broker policies
DROP POLICY IF EXISTS "Drivers can view brokers for their orders" ON public.brokers;
DROP POLICY IF EXISTS "Managers and admins can create brokers" ON public.brokers;

-- Create new broker policy allowing dispatch to create
CREATE POLICY "Dispatch, managers and admins can create brokers"
ON public.brokers
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Drop existing company update policy for dispatch
DROP POLICY IF EXISTS "Authenticated users can update companies" ON public.companies;

-- Create policy allowing only managers and admins to update companies
CREATE POLICY "Managers and admins can update companies"
ON public.companies
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Allow drivers to view their truck files
CREATE POLICY "Drivers can view their truck files"
ON public.truck_files
FOR SELECT
TO authenticated
USING (
  truck_id IN (
    SELECT id FROM public.trucks
    WHERE driver1_id IN (
      SELECT d.id FROM public.drivers d
      JOIN public.profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
    )
  )
);

-- Allow drivers to view their trailer files
CREATE POLICY "Drivers can view their trailer files"
ON public.trailer_files
FOR SELECT
TO authenticated
USING (
  trailer_id IN (
    SELECT trailer_id FROM public.trucks
    WHERE driver1_id IN (
      SELECT d.id FROM public.drivers d
      JOIN public.profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND p.role = 'driver'::app_role
    )
  )
);