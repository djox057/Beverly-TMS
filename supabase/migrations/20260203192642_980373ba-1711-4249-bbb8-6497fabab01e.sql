-- Add expense_type column to driver_expenses
-- Types: 'expense' (default), 'yearly', 'credit'
ALTER TABLE public.driver_expenses 
ADD COLUMN expense_type text NOT NULL DEFAULT 'expense';

-- Add check constraint for valid expense types
ALTER TABLE public.driver_expenses
ADD CONSTRAINT driver_expenses_type_check 
CHECK (expense_type IN ('expense', 'yearly', 'credit'));

-- Update existing expenses based on explanation patterns
-- Yearly Expenses: Registration... or Yearly Expenses: Permits... or Highway use tax
UPDATE public.driver_expenses
SET expense_type = 'yearly'
WHERE 
  LOWER(explanation) LIKE 'yearly expenses: registration%'
  OR LOWER(explanation) LIKE 'yearly expenses: permits%'
  OR LOWER(explanation) LIKE '%highway use tax%';

-- Create index for filtering by expense type
CREATE INDEX idx_driver_expenses_type ON public.driver_expenses(expense_type);