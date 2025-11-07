-- Fix log_driver_pii_access function to handle null auth.uid()
-- This happens when deleting from Supabase UI or using service role

CREATE OR REPLACE FUNCTION public.log_driver_pii_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Log SELECT operations (when data is viewed)
  IF (TG_OP = 'SELECT') THEN
    -- This will be called by application code, not automatically
    -- Applications must explicitly call this function
    RETURN NULL;
  END IF;
  
  -- Log INSERT operations (when new sensitive data is created)
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.driver_pii_audit_log (
      driver_id,
      accessed_by,
      operation,
      fields_accessed
    ) VALUES (
      NEW.driver_id,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'INSERT',
      ARRAY['ssn', 'fein', 'fuel_card_number', 'personal_id']
    );
    RETURN NEW;
  END IF;
  
  -- Log UPDATE operations (when sensitive data is modified)
  IF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.driver_pii_audit_log (
      driver_id,
      accessed_by,
      operation,
      fields_accessed
    ) VALUES (
      NEW.driver_id,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'UPDATE',
      CASE
        WHEN OLD.ssn IS DISTINCT FROM NEW.ssn 
          OR OLD.fein IS DISTINCT FROM NEW.fein
          OR OLD.fuel_card_number IS DISTINCT FROM NEW.fuel_card_number
          OR OLD.personal_id IS DISTINCT FROM NEW.personal_id
        THEN ARRAY['ssn', 'fein', 'fuel_card_number', 'personal_id']
        ELSE ARRAY[]::text[]
      END
    );
    RETURN NEW;
  END IF;
  
  -- Log DELETE operations (when sensitive data is removed)
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.driver_pii_audit_log (
      driver_id,
      accessed_by,
      operation,
      fields_accessed
    ) VALUES (
      OLD.driver_id,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'DELETE',
      ARRAY['all_fields_deleted']
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;