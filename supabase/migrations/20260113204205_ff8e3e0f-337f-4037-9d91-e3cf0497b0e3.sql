-- Add calculated_salary column to track original salary for adjustment calculations
ALTER TABLE public.dispatcher_salary_payments 
ADD COLUMN IF NOT EXISTS calculated_salary NUMERIC(10, 2);