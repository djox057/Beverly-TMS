-- Add requested_by column to driver_cash_advances table
ALTER TABLE public.driver_cash_advances 
ADD COLUMN requested_by uuid REFERENCES auth.users(id);

-- Add index for faster lookups
CREATE INDEX idx_driver_cash_advances_requested_by ON public.driver_cash_advances(requested_by);