-- Allow admins/accounting to delete cash advances (needed so deleting cash advances works in Stuff)
DROP POLICY IF EXISTS "Admins and accounting can delete cash advances" ON public.driver_cash_advances;
CREATE POLICY "Admins and accounting can delete cash advances"
ON public.driver_cash_advances
FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  OR has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Backfill expense_date for cash-advance-linked expenses (older migration created rows with expense_date = NULL)
UPDATE public.driver_expenses de
SET expense_date = (ca.requested_at AT TIME ZONE 'America/Chicago')::date
FROM public.driver_cash_advances ca
WHERE de.cash_advance_id = ca.id
  AND de.expense_date IS NULL;

-- If there are EXACTLY 3 duplicate cash advances (same driver + amount + Chicago date), delete 2 out of 3
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY driver_id, amount, (requested_at AT TIME ZONE 'America/Chicago')::date
      ORDER BY requested_at ASC, id ASC
    ) AS rn,
    count(*) OVER (
      PARTITION BY driver_id, amount, (requested_at AT TIME ZONE 'America/Chicago')::date
    ) AS cnt
  FROM public.driver_cash_advances
)
DELETE FROM public.driver_cash_advances ca
USING ranked r
WHERE ca.id = r.id
  AND r.cnt = 3
  AND r.rn > 1;