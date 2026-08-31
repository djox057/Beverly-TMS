# Fix Billboard monthly gross being lower than Analytics

## What's wrong

Billboard shows Lazar Petrovic-Tony at $238,929 for August, while Analytics shows $243,574 — a gap of exactly $4,645.

Cause (confirmed in the database): Billboard loads its orders through the `get-billboard-orders` function, which cuts off at "now minus 30 days" — a rolling *timestamp*, not a calendar date. Today at 12:59 Chicago that cutoff lands mid-day on August 1, so loads delivered earlier that day are never sent to Billboard. Tony has exactly 2 such loads worth $4,645; Ken has none, which is why only Tony's number is off and why he loses the #1 spot.

Analytics reads the full month, so its numbers are correct.

## The fix

Make Billboard's data window always cover the whole current month:

- Set the cutoff to the earlier of (a) 30 days ago and (b) the first instant of the current month in Chicago time.
- This keeps the weekly boards working exactly as today and makes the three monthly boards (RPM top 5, Gross top 5, Worst RPM) include every load delivered in the month.

No ranking logic, filters, or thresholds change — only the amount of data fetched.

## Technical details

- `supabase/functions/get-billboard-orders/index.ts`: replace the single `thirtyDaysAgo` cutoff with `min(now - 30d, startOfCurrentMonth in America/Chicago)` and keep the `gte("delivery_datetime", cutoff)` filter and logging.
- No frontend change needed; `useBillboardOrders` and `Billboard.tsx` month filtering already work on the returned set.
- Verification: after deploy, compare Billboard's August gross for Tony and Ken against the Analytics Dispatcher Performance table for August 2026 — they should match.
