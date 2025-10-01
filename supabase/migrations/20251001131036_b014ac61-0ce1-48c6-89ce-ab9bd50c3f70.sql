-- Add is_active column to drivers table
ALTER TABLE public.drivers 
ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Add index for faster filtering
CREATE INDEX idx_drivers_is_active ON public.drivers(is_active);