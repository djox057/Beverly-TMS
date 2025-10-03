-- Add driver2_id column to trucks table
ALTER TABLE public.trucks
ADD COLUMN driver2_id uuid REFERENCES public.drivers(id);

-- Add index for better query performance
CREATE INDEX idx_trucks_driver2_id ON public.trucks(driver2_id);