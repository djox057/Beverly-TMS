-- Update the create_driver_from_profile function to handle first_name and last_name
CREATE OR REPLACE FUNCTION public.create_driver_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  full_name_value TEXT;
  first_name_value TEXT;
  last_name_value TEXT;
BEGIN
  -- Only create driver if they have driver role and no driver exists with this email
  IF NEW.email IS NOT NULL AND has_role(NEW.user_id, 'driver'::app_role) THEN
    -- Extract full name
    full_name_value := COALESCE(NEW.full_name, NEW.email);
    
    -- Split name into first and last
    first_name_value := CASE 
      WHEN position(' ' in full_name_value) > 0 THEN split_part(full_name_value, ' ', 1)
      ELSE full_name_value
    END;
    
    last_name_value := CASE 
      WHEN position(' ' in full_name_value) > 0 THEN substring(full_name_value from position(' ' in full_name_value) + 1)
      ELSE ''
    END;
    
    INSERT INTO public.drivers (first_name, last_name, name, email)
    VALUES (
      first_name_value,
      last_name_value,
      full_name_value,
      NEW.email
    )
    ON CONFLICT (email) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;