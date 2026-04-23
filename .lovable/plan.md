
## Clarify "4/13" interpretation

The previous migration matched only drivers created on **April 13 of any year (MM-DD = '04-13')** → just 1 driver got $90. Everyone else got $110.

I need to confirm what "creation date 4/13" means before fixing:

### Option A — Drivers created **on or before April 13, 2026** get $90
All historical drivers (the bulk created Feb–Mar 2026 and earlier) = $90
Drivers created from April 14, 2026 onward = $110

### Option B — Drivers created **before a specific date** (you tell me which)
e.g. before "today" or before some cutoff

### Option C — Only drivers with creation date exactly April 13 (any year) = $90
This is what the last migration did (only 1 driver matched).

## Proposed fix (assuming Option A)

Single SQL UPDATE on `public.driver_expenses`:
- Filter: `is_fixed = true`, explanation contains "drug test" (excludes "random"), excludes `expense_type = 'company_expense'`
- Set `amount = 90` where `drivers.created_at AT TIME ZONE 'America/Chicago' <= '2026-04-13 23:59:59'`
- Set `amount = 110` for the rest
- Recompute `status` (paid / partial / pending) using new amount vs existing `paid_amount`

No frontend code change needed — `DEFAULT_FIXED_EXPENSES` already uses $110 for new drivers going forward.

**Please confirm A, B (with date), or C so I can run the correct migration.**
