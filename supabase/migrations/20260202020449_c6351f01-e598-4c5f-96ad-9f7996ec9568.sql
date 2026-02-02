-- Add repair_id column to driver_expenses to link with repairs
ALTER TABLE public.driver_expenses ADD COLUMN repair_id UUID REFERENCES public.repairs(id) ON DELETE CASCADE;

-- Create index for efficient lookups
CREATE INDEX idx_driver_expenses_repair_id ON public.driver_expenses(repair_id);