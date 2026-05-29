## Goal
One-time data backfill into `driver_company_history` for the week **2026-05-18 → 2026-05-24** (Chicago), inferring each driver's company from the suffix of their earliest load that week.

## Suffix → Company mapping
Mirrors `create_order_with_unique_load_number`:

- `BFU` → "bf prime united"
- `BFP` → "bf prime"
- `BF`  → "beverly freight"
- `UE`  → "united enterprise"
- `BG`  → "bg prime"
- `AP`  → "ap silver"

Resolved to `companies.id` via `ILIKE '%...%'` on `companies.name`.

## Logic (single SQL insert)

1. For every driver appearing as `driver1_id` or `driver2_id` on a non-canceled order with `pickup_datetime` in `[2026-05-18, 2026-05-25)` Chicago, pick that driver's **earliest** such order (by `pickup_datetime`, tiebreak `created_at`).
2. Extract suffix after `-` from `internal_load_number` (skip orders without a recognized suffix).
3. Map suffix → company. Skip drivers whose suffix doesn't match any known company.
4. **Only insert** for drivers with zero existing rows in `driver_company_history` (per user choice).
5. Insert one closed row:
   - `started_at = 2026-05-18 00:00:00 America/Chicago`
   - `ended_at   = 2026-05-24 23:59:59 America/Chicago`
   - `company_name_snapshot = companies.name`
   - `changed_by = NULL`, `changed_by_name_snapshot = 'Backfill 5/18–5/24'`

No schema changes. No code changes. No trigger changes.

## Out of scope
- Drivers who already have any history rows (left untouched).
- Drivers with no load that week, or whose loads have an unrecognized/missing suffix.
- Team-driver dedup beyond "earliest load wins" — driver2 is included independently and will get their own row from their earliest load that week.

## Verification
After insert, return a count and a sample (driver name, company, suffix) so you can spot-check before we move on.
