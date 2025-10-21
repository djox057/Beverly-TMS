-- Add dispatcher_id column to drivers table
ALTER TABLE public.drivers 
ADD COLUMN dispatcher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX idx_drivers_dispatcher_id ON public.drivers(dispatcher_id);

-- Migrate existing dispatcher assignments from trucks to drivers
-- For each truck with a dispatcher, assign that dispatcher to the driver1
UPDATE public.drivers d
SET dispatcher_id = t.dispatcher_id
FROM public.trucks t
WHERE t.driver1_id = d.id 
  AND t.dispatcher_id IS NOT NULL
  AND d.dispatcher_id IS NULL;

-- Optional: Remove dispatcher_id from trucks table if no longer needed
-- (Commenting out for now in case you want to keep it for transition period)
-- ALTER TABLE public.trucks DROP COLUMN dispatcher_id;