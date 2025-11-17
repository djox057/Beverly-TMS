-- Add trailers_swapped field to recovery_history table
ALTER TABLE public.recovery_history 
ADD COLUMN IF NOT EXISTS trailers_swapped boolean DEFAULT false;

-- Add comment to explain the field
COMMENT ON COLUMN public.recovery_history.trailers_swapped IS 'Indicates whether trailers were swapped between original and recovery trucks during the transfer';