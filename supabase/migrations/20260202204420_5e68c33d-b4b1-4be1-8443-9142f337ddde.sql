-- Add cash_advance_id column to driver_expenses to link cash advances to expenses
ALTER TABLE public.driver_expenses 
ADD COLUMN IF NOT EXISTS cash_advance_id UUID REFERENCES public.driver_cash_advances(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_driver_expenses_cash_advance_id ON public.driver_expenses(cash_advance_id);

-- Migrate existing cash advances to driver_expenses
-- This creates expense entries for any existing cash advances that don't already have one
INSERT INTO public.driver_expenses (driver_id, truck_number, name, explanation, amount, status, paid_amount, is_fixed, cash_advance_id, created_at)
SELECT 
  ca.driver_id,
  ca.truck_number,
  'Cash Advance',
  'Cash Advance',
  ca.amount,
  'pending',
  0,
  false,
  ca.id,
  ca.requested_at
FROM public.driver_cash_advances ca
WHERE NOT EXISTS (
  SELECT 1 FROM public.driver_expenses de WHERE de.cash_advance_id = ca.id
);