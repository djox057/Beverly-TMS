

## Problem Analysis

The load number search (2002485230) correctly finds the order and auto-switches to the KRAGUJEVAC office tab. However, the Reports grid shows "No drivers assigned" because:

- The order's pickup/delivery date is **March 5, 2026**
- Today is **March 11, 2026**
- The Reports date window shows **2 days before → 3 days after** the selected date (March 9–14)
- March 5 falls outside this window, so the grid is empty

The auto-switch engine finds the office but **never adjusts the calendar date** to match the found load.

## Solution

When a load number search finds a match via DB lookup, also fetch the order's `pickup_datetime` and pass it back to the Reports page. If the found date falls outside the current date window, automatically set `selectedDateForWindow` to the order's pickup date so the grid shows the relevant data.

### Changes

1. **`src/hooks/useAutoSwitchOffice.ts`** — In `lookupLoadOffice`, also select `pickup_datetime` from the orders query. Include `pickupDate` in the returned `OfficeResult` when `type === "found"`. Return it via `foundOrderMeta`.

2. **`src/pages/Reports.tsx`** — After `useAutoSwitchOffice` returns, check if `foundOrderMeta.pickupDate` exists and falls outside the current date window. If so, call `setSelectedDateForWindow(new Date(foundOrderMeta.pickupDate))` to auto-navigate the calendar.

### Detail

In `lookupLoadOffice`, change the select from:
```sql
select("driver1_id, locked, canceled")
```
to:
```sql
select("driver1_id, locked, canceled, pickup_datetime")
```

Add `pickupDate` to `foundOrderMeta`:
```typescript
foundOrderMeta: { isLocked?: boolean; isCanceled?: boolean; pickupDate?: string }
```

In Reports.tsx, add an effect:
```typescript
useEffect(() => {
  if (foundOrderMeta?.pickupDate) {
    const loadDate = new Date(foundOrderMeta.pickupDate);
    const windowStart = subDays(startOfDay(selectedDateForWindow), 2);
    const windowEnd = addDays(startOfDay(selectedDateForWindow), 3);
    if (loadDate < windowStart || loadDate > windowEnd) {
      setSelectedDateForWindow(startOfDay(loadDate));
    }
  }
}, [foundOrderMeta?.pickupDate]);
```

This ensures that when a load is found outside the visible date window, the calendar automatically navigates to show it.

