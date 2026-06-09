## What to add

Next to the fuel `%` indicator in each truck row (Reports load info area), add a small `$` button. Clicking it opens a popover showing this-week-only totals for that truck:

- **Freight** — sum of `freight_amount` across orders with pickup date in current week, with **RPM** = freight / loaded_miles
- **Stop Amt** — sum of `driver_price` (driver pay) for the same orders, with **RPM** = stop_amt / loaded_miles
- **Comm** — Freight − Stop Amt, with **Comm%** = Comm / Freight × 100

## Scope

- Only `src/pages/Reports.tsx`. No backend / business-logic changes.
- "Current week" = Monday 00:00 → Sunday 23:59 **Chicago time** (matches existing project standard).
- Data source: `truck.activeOrders` (already loaded for each row). Filter by `order.pickupStops?.[0]?.datetime || order.pickup_datetime` falling in the current Chicago week.
- Exclude canceled orders (consistent with existing DH/miles rules in the project).

## Placement

In the truck cell, in the row of HOS/fuel icons (around line 6111–6133), add a `Popover` after the fuel block:

```text
[HOS timers] [🚧?] [⛽ 87%] [$]   ← new
```

The `$` is a small `Button` (`variant="ghost"`, ~31px, same visual weight as fuel icon, green tint). Hidden when there are no qualifying orders this week (or render with em-dashes).

## Popover content

Small card (~200px) styled like `CellSelectionSummary`:

```text
This week · N order(s)
─────────────────────────
Freight:    $12,450   ($2.31/mi)
Stop Amt:    $6,225   ($1.16/mi)
Comm:        $6,225   (50.0%)
```

Currency via existing `formatCurrency`; RPM as `$X.XX`; Comm% to 1 decimal. Show `—` for any metric with 0 miles or 0 freight.

## Technical details

- Compute the Chicago Mon–Sun window once per render using existing date utilities (`getOrderPickupDateForCarousel` style — already imported) or `Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago' })`.
- Per-truck memoized aggregation:
  ```ts
  const weekStats = useMemo(() => {
    const inWeek = (truck.activeOrders ?? []).filter(o =>
      !o.canceled &&
      isInChicagoWeek(o.pickupStops?.[0]?.datetime || o.pickup_datetime)
    );
    const freight = sum(inWeek, o => +o.freight_amount || 0);
    const pay     = sum(inWeek, o => +o.driver_price  || 0);
    const miles   = sum(inWeek, o => +o.loaded_miles || +o.mileage || 0);
    return { freight, pay, miles, comm: freight - pay, count: inWeek.length };
  }, [truck.activeOrders]);
  ```
  Inlined inside the row map; no new hook needed.
- Reuse existing `Popover`, `PopoverTrigger`, `PopoverContent` imports.

## Not in scope

- No edge function changes, no DB changes, no email/legend changes.
- Does not affect cell-selection summary, analytics, or payroll calculations.
