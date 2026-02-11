-- Add last_dispatcher_id to drivers
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS last_dispatcher_id uuid;

-- Trigger function: only fires when dispatcher_id goes from non-null to null
CREATE OR REPLACE FUNCTION public.preserve_last_dispatcher_id()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.dispatcher_id IS NOT NULL AND NEW.dispatcher_id IS NULL THEN
    NEW.last_dispatcher_id := OLD.dispatcher_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trigger_preserve_last_dispatcher ON public.drivers;
CREATE TRIGGER trigger_preserve_last_dispatcher
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_last_dispatcher_id();