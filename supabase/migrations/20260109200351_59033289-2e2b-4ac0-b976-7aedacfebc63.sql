-- Add lumper_revised_rc_path column to orders table to track revised RC for lumper requests
ALTER TABLE public.orders
ADD COLUMN lumper_revised_rc_path TEXT NULL;

COMMENT ON COLUMN public.orders.lumper_revised_rc_path IS 'Path to revised rate confirmation file when lumper was requested';