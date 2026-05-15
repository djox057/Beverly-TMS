## Goal

Stop counting loads driven by recovery drivers as "normal" loads in dispatcher Analytics and dispatcher Salaries, while still:
- Including them in the **Totals** row at the top of Analytics
- Crediting the dispatcher in **Salaries** as a separate "Recovery bonus" line using the same formula

## What counts as a "recovery load"

A load is a recovery load when its assigned **driver1** is a recovery driver (`drivers.is_recovery = true`) — i.e. the driver who actually delivered it. We do **not** look at `orders.is_recovery`. This way:
- Loads originally booked normally but later finished by a recovery driver count as recovery (because driver1 changed to a recovery driver).
- A `is_recovery` order flag where the current driver1 is somehow not a recovery driver would still count as normal.
- Source of truth is always the current `driver1_id → drivers.is_recovery`.

The `booked_by` (original dispatcher) on the order is unchanged — that's what the recovery bonus credits.

---

## 1. Dispatcher Analytics grid

In `src/pages/Analytics.tsx`, dispatcher rows are built from `filteredOrders` grouped by `booked_by`. Build a recovery-driver id set from the already-loaded `drivers` list:

```ts
const recoveryDriverIds = new Set(
  (drivers || []).filter(d => d.is_recovery).map(d => d.id)
);
```

Then split each order by `recoveryDriverIds.has(order.driver1_id)`:

- **Normal dispatcher rows in the grid**: aggregate only orders where driver1 is **not** a recovery driver. Affects every column: Total Freight, Total Cut, RPM, Loads, Avg per truck, etc.
- **Totals row at top**: keep using all orders (unchanged) so company-wide numbers still include recovery loads.
- **Recovery aggregates per dispatcher**: a parallel map `recoveryByDispatcher[booked_by] = { freight, cut, loads, miles }` from only the recovery-driver orders. Used by the Salaries tab; not displayed in the dispatcher grid.

Driver Analytics is unaffected — recovery-office drivers are already hidden there via `recoveryDriverNames`.

## 2. Salaries tab

Current formula: `baseRate = stat.totalFreight * 0.01 + stat.cut * 0.05`.

After the change, `stat.totalFreight` / `stat.cut` exclude recovery-driver loads, so base drops. To keep dispatchers whole:

- Compute `recoveryBonus = recoveryFreight * 0.01 + recoveryCut * 0.05` per dispatcher (same formula on their recovery loads only).
- Render a **second row directly under each dispatcher** in the Salaries table titled "Recovery bonus" showing recovery freight, recovery cut, and the bonus amount. Other columns (Extra/Lost days, Food, Adjustments, Paid) are blank on this sub-row — they apply only to the main salary line.
- The main row's **Salary** column keeps today's formula on non-recovery numbers. The recovery bonus is added into `fullTotal` and into `calculatedSalaries[userId]` so the Paid column and bulk "Mark all paid" settle the correct total.
- Only render the sub-row when `recoveryFreight > 0 || recoveryCut > 0`.
- Persistence: `calculated_salary` already stores the final number, so the bonus is captured automatically when paid. No schema changes.

Edge cases:
- Dispatcher with only recovery loads in the month: main row shows 0 freight / 0 cut / base 0; sub-row shows the bonus; Salary = 0 + bonus + extras/lost/food/adjustments.
- Carry-over (`prevMonthAdjustment`) keeps using stored `calculated_salary`, so historical months are unaffected.
- Dispatch-only "My Salary" view: same treatment, sub-row visible.

## 3. Other places

- **Dispatcher Performance / Bonuses dialog**: shares `dispatcherStats`. Recovery loads will be excluded from the ranking — matches the intent.
- **Driver Analytics, totals row, all-time tiers, Billboard, Reports, edge functions**: not touched. (Per project memory, the `recompute-analytics-aggregates` precompute path is not in use.)

## Technical notes

Files to change:
- `src/pages/Analytics.tsx`
  - Build `recoveryDriverIds` from `drivers`.
  - In the `dispatcherStats` memo: split by `recoveryDriverIds.has(o.driver1_id)`; main aggregates use non-recovery only; expose `recoveryFreight`, `recoveryCut`, `recoveryLoads`, `recoveryMiles` per dispatcher on each stat object.
  - Keep the existing Totals computation using all orders.
  - In the Salaries `TableBody`: after each dispatcher `<TableRow>`, conditionally render a "Recovery bonus" `<TableRow>`; add `recoveryBonus` into `fullTotal` and `calculatedSalaries[stat.userId]`.

No DB migration. No edge function change. No change to how recovery loads are created or stored.