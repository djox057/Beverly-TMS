ALTER TABLE public.mandatory_yard_repairs
  ADD COLUMN dispatch_email_sent_at timestamptz,
  ADD COLUMN dispatch_email_claimed_at timestamptz,
  ADD COLUMN dispatch_email_error text,
  ADD COLUMN dispatch_email_payload jsonb;

CREATE FUNCTION public.protect_yard_repair_email_state() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.dispatch_email_sent_at := NULL;
      NEW.dispatch_email_claimed_at := NULL;
      NEW.dispatch_email_error := NULL;
      NEW.dispatch_email_payload := NULL;
    ELSE
      NEW.dispatch_email_sent_at := OLD.dispatch_email_sent_at;
      NEW.dispatch_email_claimed_at := OLD.dispatch_email_claimed_at;
      NEW.dispatch_email_error := OLD.dispatch_email_error;
      NEW.dispatch_email_payload := OLD.dispatch_email_payload;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_yard_repair_email_state() FROM PUBLIC;
CREATE TRIGGER protect_yard_repair_email_state BEFORE INSERT OR UPDATE ON public.mandatory_yard_repairs
FOR EACH ROW EXECUTE FUNCTION public.protect_yard_repair_email_state();
