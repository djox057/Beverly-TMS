-- Create a function to format phone numbers to (XXX) XXX-XXXX format
CREATE OR REPLACE FUNCTION format_phone_number(phone_value TEXT)
RETURNS TEXT AS $$
DECLARE
  digits TEXT;
BEGIN
  IF phone_value IS NULL OR phone_value = '' THEN
    RETURN phone_value;
  END IF;
  
  -- Remove all non-digit characters
  digits := regexp_replace(phone_value, '\D', '', 'g');
  
  -- If not exactly 10 digits, return original value
  IF length(digits) != 10 THEN
    RETURN phone_value;
  END IF;
  
  -- Format as (XXX) XXX-XXXX
  RETURN '(' || substring(digits, 1, 3) || ') ' || substring(digits, 4, 3) || '-' || substring(digits, 7, 4);
END;
$$ LANGUAGE plpgsql;

-- Update all existing phone numbers in drivers table
UPDATE public.drivers
SET phone = format_phone_number(phone)
WHERE phone IS NOT NULL 
  AND phone != ''
  AND phone !~ '^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$';

UPDATE public.drivers
SET emergency_contact_phone = format_phone_number(emergency_contact_phone)
WHERE emergency_contact_phone IS NOT NULL 
  AND emergency_contact_phone != ''
  AND emergency_contact_phone !~ '^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$';

-- Drop the function after use (it was just for this migration)
DROP FUNCTION format_phone_number(TEXT);