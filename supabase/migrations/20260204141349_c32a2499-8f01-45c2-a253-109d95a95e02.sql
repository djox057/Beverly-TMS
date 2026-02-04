-- Add credit status columns to brokers table
ALTER TABLE public.brokers 
ADD COLUMN credit_status TEXT NOT NULL DEFAULT 'buy',
ADD COLUMN credit_limit_amount NUMERIC(12,2) NULL;

-- Add check constraint for valid credit status values
ALTER TABLE public.brokers 
ADD CONSTRAINT brokers_credit_status_check 
CHECK (credit_status IN ('buy', 'no_buy', 'credit_limit'));

-- Add check constraint to ensure credit_limit_amount is positive when status is credit_limit
ALTER TABLE public.brokers 
ADD CONSTRAINT brokers_credit_limit_amount_check 
CHECK (
  (credit_status = 'credit_limit' AND credit_limit_amount > 0) OR 
  (credit_status != 'credit_limit' AND credit_limit_amount IS NULL)
);

-- Set all existing brokers to 'buy' (already handled by default, but explicit)
UPDATE public.brokers SET credit_status = 'buy' WHERE credit_status IS NULL;