
-- Add last_dispatcher_name column
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS last_dispatcher_name text;

-- Update trigger to also snapshot dispatcher name
CREATE OR REPLACE FUNCTION public.preserve_last_dispatcher_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  disp_name text;
BEGIN
  IF OLD.dispatcher_id IS NOT NULL AND NEW.dispatcher_id IS NULL THEN
    NEW.last_dispatcher_id := OLD.dispatcher_id;
    -- Snapshot dispatcher name
    SELECT full_name INTO disp_name FROM profiles WHERE user_id = OLD.dispatcher_id;
    IF disp_name IS NOT NULL THEN
      NEW.last_dispatcher_name := disp_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill for deleted dispatcher 41fab334
UPDATE drivers 
SET last_dispatcher_name = 'Milos Jankovic-Ramsey'
WHERE last_dispatcher_id = '41fab334-f022-4520-b19a-6550d125396f'
  AND last_dispatcher_name IS NULL;

-- Backfill for all dispatchers that still exist
UPDATE drivers d
SET last_dispatcher_name = p.full_name
FROM profiles p
WHERE d.last_dispatcher_id = p.user_id
  AND d.last_dispatcher_name IS NULL
  AND d.last_dispatcher_id IS NOT NULL;
