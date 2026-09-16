# Driver Expenses: one row per expense

Today each driver trip is a single wide row holding the ticket, bag, motel, Uber and total together. The page becomes a simple list where every expense is its own row, with far fewer columns.

## What the data shows

2,434 existing rows, one per driver trip:
- 1,455 have a ticket amount
- 1,851 have an Uber amount
- 1,877 have motel nights, but the motel cost is empty on every single row
- 88 have a bag amount
- Total Exp is the sum of ticket + bag + motel + Uber

## New layout

One row per expense, driver name repeated on each line:

```text
Recruiter | Driver         | Truck | Type   | Amount  | Date       | Details                 | Card | Airline | Paid   | Notes
Tyler     | Edward Jones   | 5936  | Ticket | 342.40  | 09/11/2026 |                         | 1234 | Delta   | Unpaid |
Tyler     | Edward Jones   | 5936  | Motel  |         | 09/13/2026 | 1 night                 |      |         | Unpaid |
Tyler     | Edward Jones   | 5936  | Uber   |  79.81  | 09/13/2026 | ORD-office              |      |         | Paid   |
```

Expense types: Ticket, Bag, Motel, Uber, Other.

- Paid/Unpaid is tracked per expense line, so the ticket can be paid while the Uber is still open.
- Motel lines keep the number of nights and gain an amount field you can fill in (blank on all imported rows).
- Card and Airline stay on the lines they apply to (normally the ticket line).
- Details holds the Uber destinations, motel nights text, or a free note.

## Behaviour

- Same filters as now: search, Recruiter, Airline, Status, Card, Paid/Unpaid, date range — plus a new Type filter.
- Double-click a cell to edit inline, exactly as today.
- "Add expense" creates a single line. A driver's rows group together visually (same driver + trip stay adjacent), and the totals bar shows the sum of the visible lines.
- Instead of a per-row Total Exp column, each driver's trip total appears as a small subtotal on the driver's first line, so nothing is lost.
- Same access rules: admin, manager, recruiting, chicago_management can view; admin, manager, recruiting can edit.

## Technical notes

- New table `recruiting_driver_expense_lines`: `id`, `trip_id` (groups the lines of one driver trip), `recruiter`, `recruiter_id`, `driver_name`, `truck_number`, `expense_type` (ticket/bag/motel/uber/other), `amount`, `expense_date`, `details`, `nights`, `card`, `airline`, `status`, `is_paid`, `payment_notes`, `notice`, timestamps. GRANTs to `authenticated`/`service_role`, RLS mirroring `recruiting_driver_expenses` (SELECT for admin/manager/recruiting/chicago_management, write for admin/manager/recruiting), indexes on `trip_id`, `expense_date DESC`, `lower(driver_name)`, `updated_at` trigger.
- One-time backfill from the existing 2,434 rows: a ticket line where `ticket_price` is set (carrying card, airline, purchase_date), a bag line where `bag_amount` is set, a motel line where `motel_nights` is set (amount null, nights carried, arrival_date as date), an Uber line where `uber_amount` is set (uber_destinations as details, arrival_date as date). `status`, `payment_notes`, `notice` copy to every line of the trip; `is_paid` derives from the existing paid/unpaid text. Trips with no amounts at all still get one "other" line so no driver disappears.
- `recruiting_driver_expenses` is left untouched as a fallback until you confirm the new page looks right; it can be dropped afterwards.
- `src/pages/DriverExpenses.tsx` is rewritten against the new table: lean column set, Type filter, per-line inline editing, per-line paid toggle, per-trip subtotal, visible-lines totals bar. Access helpers in `src/lib/driverExpensesAccess.ts` unchanged.
- `src/lib/mcp/tools/list-driver-expenses.ts` targets a different table (`driver_expenses`, the fleet debt sheet) and is not affected.
