
-- Add is_checked column to dispatcher_salary_payments
ALTER TABLE public.dispatcher_salary_payments
ADD COLUMN is_checked boolean NOT NULL DEFAULT false;
