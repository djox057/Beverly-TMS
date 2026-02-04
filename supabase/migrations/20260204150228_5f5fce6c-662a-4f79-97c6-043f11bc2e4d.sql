-- Add credit_used_amount column for manual tracking
ALTER TABLE public.brokers ADD COLUMN credit_used_amount numeric DEFAULT 0;