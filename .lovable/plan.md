

## Problem

Order LEGFSM2092 has pickup Mar 13 and delivery Mar 14 but is still `pending`. When viewing Reports on Mar 17, the date window is Mar 15–20, so neither date falls in range. The order (and its files) don't appear. Going 1 day back shifts the window to include Mar 14, making it appear.

The root cause is in `fetchOrdersForDateWindow` and `fetchLockedOrdersForDateWindow` in `src/hooks/useReportsDateWindow.ts`. They filter strictly by date window:
```
.or(`and(pickup_datetime.gte...,pickup_datetime.lte...),and(delivery_datetime.gte...,delivery_datetime.lte...)`)
```

The old `useReports.ts` hook handled this by also including `status.eq.in_transit,status.eq.pending` orders regardless of date — any active/in-progress order always appeared.

## Plan

**File: `src/hooks/useReportsDateWindow.ts`**

1. **Modify `fetchOrdersForDateWindow`** (unlocked orders, ~line 159-173): Change the date filter to also include orders with `status = 'pending'` or `status = 'in_transit'` that belong to the driver scope, regardless of date window. The `.or()` filter on line 171 becomes:
   ```
   .or(`and(pickup_datetime.gte.${startDateStr},pickup_datetime.lte.${endDateStr}T23:59:59),and(delivery_datetime.gte.${startDateStr},delivery_datetime.lte.${endDateStr}T23:59:59),status.eq.in_transit,status.eq.pending`)
   ```
   This matches what the old `useReports.ts` did — active orders always show up.

2. **No change needed for `fetchLockedOrdersForDateWindow`** — locked orders are by definition completed, so they won't have pending/in_transit status.

3. **No change needed for `fetchGapFillOrders`** — gap-fill is for recently locked orders, same logic applies.

This is a one-line change that ensures any unlocked order that is still pending or in transit for the driver's scope is always fetched, matching the behavior of the legacy hook.

