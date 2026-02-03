-- Drop the existing check constraint and add a new one with company_expense
ALTER TABLE public.driver_expenses 
DROP CONSTRAINT IF EXISTS driver_expenses_type_check;

ALTER TABLE public.driver_expenses 
ADD CONSTRAINT driver_expenses_type_check 
CHECK (expense_type IN ('expense', 'yearly', 'credit', 'company_expense'));