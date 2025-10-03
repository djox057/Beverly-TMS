-- Create audit log table for sensitive PII access
CREATE TABLE public.driver_pii_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  accessed_by uuid NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  operation text NOT NULL, -- 'SELECT', 'INSERT', 'UPDATE', 'DELETE'
  ip_address inet,
  user_agent text,
  fields_accessed text[], -- Which specific fields were accessed
  access_reason text -- Optional: why the access was needed
);

-- Enable RLS on audit log (admins only)
ALTER TABLE public.driver_pii_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view PII audit logs"
  ON public.driver_pii_audit_log
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- System can insert audit logs (executed by triggers)
CREATE POLICY "System can insert PII audit logs"
  ON public.driver_pii_audit_log
  FOR INSERT
  WITH CHECK (true);

-- Create function to log sensitive PII access
CREATE OR REPLACE FUNCTION public.log_driver_pii_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      auth.uid(),
      'INSERT',
      ARRAY['ssn', 'fein', 'home_address', 'fuel_card_number', 'personal_id']
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
      auth.uid(),
      'UPDATE',
      CASE
        WHEN OLD.ssn IS DISTINCT FROM NEW.ssn 
          OR OLD.fein IS DISTINCT FROM NEW.fein
          OR OLD.home_address IS DISTINCT FROM NEW.home_address
          OR OLD.fuel_card_number IS DISTINCT FROM NEW.fuel_card_number
          OR OLD.personal_id IS DISTINCT FROM NEW.personal_id
        THEN ARRAY['ssn', 'fein', 'home_address', 'fuel_card_number', 'personal_id']
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
      auth.uid(),
      'DELETE',
      ARRAY['all_fields_deleted']
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create triggers for automatic audit logging on INSERT, UPDATE, DELETE
CREATE TRIGGER audit_driver_pii_insert
  AFTER INSERT ON public.driver_sensitive_pii
  FOR EACH ROW
  EXECUTE FUNCTION public.log_driver_pii_access();

CREATE TRIGGER audit_driver_pii_update
  AFTER UPDATE ON public.driver_sensitive_pii
  FOR EACH ROW
  EXECUTE FUNCTION public.log_driver_pii_access();

CREATE TRIGGER audit_driver_pii_delete
  AFTER DELETE ON public.driver_sensitive_pii
  FOR EACH ROW
  EXECUTE FUNCTION public.log_driver_pii_access();

-- Create helper function for manual logging of SELECT operations
-- Applications should call this when viewing sensitive PII
CREATE OR REPLACE FUNCTION public.log_pii_view(
  p_driver_id uuid,
  p_fields_accessed text[],
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.driver_pii_audit_log (
    driver_id,
    accessed_by,
    operation,
    fields_accessed,
    access_reason
  ) VALUES (
    p_driver_id,
    auth.uid(),
    'SELECT',
    p_fields_accessed,
    p_reason
  );
END;
$$;

-- Add index for faster audit log queries
CREATE INDEX idx_driver_pii_audit_driver_id ON public.driver_pii_audit_log(driver_id);
CREATE INDEX idx_driver_pii_audit_accessed_by ON public.driver_pii_audit_log(accessed_by);
CREATE INDEX idx_driver_pii_audit_accessed_at ON public.driver_pii_audit_log(accessed_at DESC);

-- Add comment explaining the table's purpose
COMMENT ON TABLE public.driver_pii_audit_log IS 'Audit log for all access to driver sensitive PII. Tracks who accessed what data and when for security compliance.';

-- Create view for managers/admins to see recent sensitive data access
CREATE VIEW public.recent_pii_access AS
SELECT 
  al.id,
  al.accessed_at,
  al.operation,
  al.fields_accessed,
  al.access_reason,
  d.name as driver_name,
  p.full_name as accessed_by_name,
  p.email as accessed_by_email,
  p.role as accessed_by_role
FROM public.driver_pii_audit_log al
JOIN public.drivers d ON d.id = al.driver_id
LEFT JOIN public.profiles p ON p.user_id = al.accessed_by
WHERE al.accessed_at > NOW() - INTERVAL '30 days'
ORDER BY al.accessed_at DESC
LIMIT 1000;