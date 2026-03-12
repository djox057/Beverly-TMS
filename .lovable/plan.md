

## How Canceled Orders Should Work in Reports

Per the **REPORTS_SPECIFICATION.md** (Section 2.1-2.2):

1. **General rule**: ALL orders display in Reports **except** canceled orders (with one exception).
2. **Exception**: The **most recent canceled order** SHOULD display IF:
   - Its pickup date is today (string comparison, no timezone conversion)
   - There is NO other non-canceled order for that driver with the same or later pickup date

This means a canceled order with today's pickup should still show (in red) if the driver has nothing else booked for today or later — it indicates the driver just lost their load and needs a new one.

---

## Why Canceled Orders Are Not Showing

The data-fetching layer **explicitly excludes all canceled orders** at the database query level. There are **three** places doing `.eq("canceled", false)`:

1. **`src/hooks/useReportsDateWindow.ts` line 170** — main unlocked orders query
2. **`src/hooks/useReportsDateWindow.ts` line 269** — locked orders query  
3. **`src/hooks/useReportsDateWindowAdapter.ts` line 674** — last-load fallback query

Additionally, the **realtime handler** in `useReportsDateWindowAdapter.ts` (line 1180) evicts any order that becomes canceled from the in-memory store.

Since canceled orders are filtered out at the SQL level, they never reach the client — so the "canceled order exception" logic from the spec **cannot work** because the data simply isn't there.

---

## Fix Plan

### 1. Remove `canceled = false` filter from the main queries (useReportsDateWindow.ts)

- **Line 170**: Remove `.eq("canceled", false)` from the unlocked orders query
- **Line 269**: Remove `.eq("canceled", false)` from the locked orders query

This lets canceled orders flow into the client alongside non-canceled ones.

### 2. Apply the canceled-order exception logic client-side

In the Reports rendering/grouping code (likely where orders are assigned to trucks), add filtering logic:

```
For each driver's orders:
  - Include all non-canceled orders
  - Include a canceled order ONLY IF:
    - It's the most recent canceled order
    - Its pickup date equals today (string compare)
    - No other non-canceled order has a pickup date >= today
  - Exclude all other canceled orders
```

### 3. Update the realtime handler (useReportsDateWindowAdapter.ts ~line 1180)

Instead of unconditionally evicting canceled orders, patch them into the store like any other order. The client-side filtering (step 2) will handle whether they display.

### 4. Keep the locked-orders query filtered

Locked canceled orders should NOT display per spec (Section 2.3), so keep `.eq("canceled", false)` on the locked orders query (line 269). Only remove it from the unlocked query.

