-- Function to automatically create driver record when a driver profile is created
CREATE OR REPLACE FUNCTION public.create_driver_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create driver if role is 'driver' and no driver exists with this email
  IF NEW.role = 'driver' AND NEW.email IS NOT NULL THEN
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

-- Create trigger to automatically create driver records
DROP TRIGGER IF EXISTS on_driver_profile_created ON public.profiles;
CREATE TRIGGER on_driver_profile_created
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role = 'driver')
  EXECUTE FUNCTION public.create_driver_from_profile();

-- Add unique constraint on drivers email if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'drivers_email_key'
  ) THEN
    ALTER TABLE public.drivers ADD CONSTRAINT drivers_email_key UNIQUE (email);
  END IF;
END $$;