-- Create table for sensitive driver PII (managers and admins only)
CREATE TABLE public.driver_sensitive_pii (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL UNIQUE REFERENCES public.drivers(id) ON DELETE CASCADE,
  ssn text,
  fein text,
  home_address text,
  home_city text,
  home_state text,
  home_latitude numeric,
  home_longitude numeric,
  fuel_card_number text,
  personal_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on the sensitive PII table
ALTER TABLE public.driver_sensitive_pii ENABLE ROW LEVEL SECURITY;

-- Only managers and admins can view sensitive PII
CREATE POLICY "Managers and admins can view driver sensitive PII"
  ON public.driver_sensitive_pii
  FOR SELECT
  USING (
    has_role(auth.uid(), 'manager') OR 
    has_role(auth.uid(), 'admin')
  );

-- Only managers and admins can insert sensitive PII
CREATE POLICY "Managers and admins can create driver sensitive PII"
  ON public.driver_sensitive_pii
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'manager') OR 
    has_role(auth.uid(), 'admin')
  );

-- Only managers and admins can update sensitive PII
CREATE POLICY "Managers and admins can update driver sensitive PII"
  ON public.driver_sensitive_pii
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'manager') OR 
    has_role(auth.uid(), 'admin')
  );

-- Only admins can delete sensitive PII
CREATE POLICY "Admins can delete driver sensitive PII"
  ON public.driver_sensitive_pii
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Migrate existing sensitive data from drivers table to new table
INSERT INTO public.driver_sensitive_pii (
  driver_id, 
  ssn, 
  fein, 
  home_address, 
  home_city, 
  home_state, 
  home_latitude, 
  home_longitude, 
  fuel_card_number, 
  personal_id
)
SELECT 
  id,
  ssn,
  fein,
  home_address,
  home_city,
  home_state,
  home_latitude,
  home_longitude,
  fuel_card_number,
  personal_id
FROM public.drivers
WHERE ssn IS NOT NULL 
   OR fein IS NOT NULL 
   OR home_address IS NOT NULL 
   OR fuel_card_number IS NOT NULL 
   OR personal_id IS NOT NULL;

-- Add updated_at trigger to new table
CREATE TRIGGER update_driver_sensitive_pii_updated_at
  BEFORE UPDATE ON public.driver_sensitive_pii
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Drop sensitive columns from drivers table
ALTER TABLE public.drivers 
  DROP COLUMN IF EXISTS ssn,
  DROP COLUMN IF EXISTS fein,
  DROP COLUMN IF EXISTS home_address,
  DROP COLUMN IF EXISTS home_city,
  DROP COLUMN IF EXISTS home_state,
  DROP COLUMN IF EXISTS home_latitude,
  DROP COLUMN IF EXISTS home_longitude,
  DROP COLUMN IF EXISTS fuel_card_number,
  DROP COLUMN IF EXISTS personal_id;

COMMENT ON TABLE public.driver_sensitive_pii IS 'Contains sensitive PII for drivers. Access restricted to managers and admins only.';