-- Normalize fixed Drug Test starting expense:
--   $90 for drivers created on or before April 13, 2026 (Chicago tz)
--   $110 for drivers created after that
-- Recompute status based on new amount vs paid_amount.

UPDATE public.driver_expenses e
SET 
  amount = CASE 
    WHEN (d.created_at AT TIME ZONE 'America/Chicago')::date <= DATE '2026-04-13' THEN 90
    ELSE 110
  END,
  status = CASE 
    WHEN COALESCE(e.paid_amount, 0) >= (
      CASE WHEN (d.created_at AT TIME ZONE 'America/Chicago')::date <= DATE '2026-04-13' THEN 90 ELSE 110 END
    ) THEN 'paid'
    WHEN COALESCE(e.paid_amount, 0) > 0 THEN 'partial'
    ELSE 'pending'
  END,
  updated_at = now()
FROM public.drivers d
WHERE e.driver_id = d.id
  AND e.is_fixed = true
  AND e.explanation ILIKE '%drug test%'
  AND e.explanation NOT ILIKE '%random%'
  AND e.expense_type <> 'company_expense';