## Salary Charge from Orders (Managers/Admins)

Add the ability to mark an order to create a "Charge" entry on the booker's monthly salary, available from Load Info (Reports) and from Edit Order. Visible/usable to admin and manager only.

### Behavior

- A "Mark for Salary Charge" button appears next to load info (in the Reports Load Info dialog and at the top of the Edit Order page) for admins and managers only.
- Clicking opens a popup that shows:
  - Booked by (the user name from the order's `booked_by`)
  - Delivery date (`delivery_datetime`, Chicago tz)
  - Freight Amount, Driver Pay, and a live preview of the computed Charge
  - Percentage input (0 – 100, default 50)
  - Reason text (required)
- Save:
  - Resolves the booker name to a `user_id` via `profiles.full_name` (same mapping Analytics already uses). If it can't be resolved, show an error and abort.
  - Determines the month as `YYYY-MM` of the order's delivery date in Chicago time.
  - Computes the charge: `(freight * 0.01 + (freight - driver_pay) * 0.05) * percent / 100`. Negative results clamp to 0 (defensive only).
  - Upserts a row in `dispatcher_salary_payments` for `(user_id, month)` and adds/updates a single entry in the `additionals` JSONB array of shape `{ type: 'charge', amount, reason, order_id, percent, source: 'order_charge' }`. Existing entry for the same `order_id` is replaced rather than duplicated.
  - The order itself stores a marker (`salary_charge_percent`, `salary_charge_reason`, `salary_charge_user_id`, `salary_charge_month`) so the button shows the current state and supports edit/unmark.
- If the order is already marked, the popup is pre-filled and shows an "Unmark" button that:
  - Removes the matching `order_id` entry from `additionals` on that salary row.
  - Clears the marker columns on the order.
- If freight or driver pay is later edited on the order, the next time someone opens/saves the marker it recomputes. (No automatic background recalculation in this pass — keeps scope narrow.)

### UI placement

- Reports → Load Info dialog (existing dialog used to view a load): add a button row at the bottom, visible only to admin/manager.
- Edit Order page: small button in the header area near other order actions, same visibility rule.
- Existing Analytics → Payroll dialog already renders charges from `additionals`; no changes needed there — the new entry will appear automatically under "Charges" with the reason shown, contributing as a deduction (matches user's request).

### Technical details

Database migration:

```text
ALTER TABLE public.orders
  ADD COLUMN salary_charge_percent numeric,
  ADD COLUMN salary_charge_reason  text,
  ADD COLUMN salary_charge_user_id uuid,
  ADD COLUMN salary_charge_month   text;
```

No new RLS policies for `orders` (existing policies cover it). The trigger `prevent_manager_supervisor_restricted_fields` already excludes these new columns, so manager/admin updates work as-is.

Frontend:

- New component `src/components/MarkSalaryChargeDialog.tsx` — popup with percent (0–100, default 50), reason, computed preview, Save / Unmark / Cancel.
- New hook `src/hooks/useOrderSalaryCharge.ts` — handles resolve-user, upsert into `dispatcher_salary_payments`, and merging/removing the `order_id`-tagged entry in `additionals`.
- Mount the trigger button in:
  - `src/pages/Reports.tsx` Load Info dialog (or wherever the load info popup is rendered — found by searching for the dialog used on the Reports page).
  - `src/pages/EditOrder.tsx` header.
- Visibility gate: `useAuthContext().hasRole('admin') || hasRole('manager')`.

Edge cases handled:

- `booked_by` missing → button disabled with tooltip "No booker on order".
- Booker can't be resolved to a profile (deleted user with no historical mapping) → save shows an error toast.
- `delivery_datetime` missing → button disabled with tooltip "Set delivery date first".
- Freight or driver pay missing → treated as 0 in the formula.
- Concurrent edits: the upsert reads `additionals`, removes any prior entry with the same `order_id`, appends the new one, and writes back atomically per row.

### Out of scope

- Auto-recompute when freight/driver pay on the order changes later.
- Bulk marking multiple orders at once.
- Showing the per-order list of charges inside the payroll dialog (the charges already appear; per-order drill-down can come later if needed).
