## Salary Charge from Orders (Managers/Admins)

A way for admins/managers to add a "Charge" entry to a user's monthly salary based on an order's freight and driver pay. The order itself is not modified.

### Behavior

- A "Add Salary Charge" button appears in:
  - The Reports Load Info popup
  - The Edit Order page header
  Visible only to users with `admin` or `manager` role.
- Clicking opens a popup that shows (read-only):
  - Booked by: the user from the order's `booked_by`
  - Delivery date: `delivery_datetime` (Chicago tz)
  - Freight Amount and Driver Pay from the order
  - Live preview of computed Charge
- Inputs:
  - Percentage (0 – 100, default 50)
  - Reason (required)
- On Save:
  - Resolves `booked_by` → `user_id` via `profiles.full_name` (same lookup Analytics already does). Show error toast and abort if unresolved.
  - Determines the target month as `YYYY-MM` of `delivery_datetime` in Chicago time.
  - Computes charge: `(freight * 0.01 + (freight - driver_pay) * 0.05) * percent / 100`. Clamp negatives to 0.
  - Upserts a row in `dispatcher_salary_payments` for `(user_id, month)` and appends a new entry to the `additionals` JSONB array of shape:
    ```
    { type: 'charge', amount, reason, order_id, percent, source: 'order_charge' }
    ```
  - Each click adds a new charge entry (no dedupe on `order_id`), since the user explicitly clicked "Add". The `order_id`/`source` are stored for traceability only.
  - Closes the popup and shows a success toast like "Charge of $X added to <user> for <month>".
- The order is NOT updated. No new columns on `orders`.

### Where the charge appears

The Analytics Payroll dialog already renders `additionals` charges (type `charge`) as deductions with the reason shown. The new entries surface there automatically.

### Files

New:
- `src/components/AddOrderSalaryChargeDialog.tsx` — the popup (form, preview, save).
- `src/hooks/useAddOrderSalaryCharge.ts` — resolve user, compute month, upsert/append into `additionals`.

Modified (button mount + visibility gate via `useAuthContext().hasRole('admin') || hasRole('manager')`):
- Reports Load Info dialog (located by searching for its render site in `src/pages/Reports.tsx` / `src/pages/Reports/`).
- `src/pages/EditOrder.tsx` header.

### Edge cases

- Missing `booked_by` → button disabled with tooltip "No booker on order".
- Missing `delivery_datetime` → disabled with tooltip "Set delivery date first".
- Booker name doesn't match any profile (deleted user with no historical mapping) → error toast on save.
- Missing freight or driver pay → treated as 0 in the formula.
- No database migration needed.
