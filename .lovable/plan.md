

# Fix: Recompute Pagination Bug Dropping Orders

## Problem Identified

After detailed investigation, the root cause is a **pagination bug in the `recompute-analytics-aggregates` edge function** that drops 5 orders during data ingestion.

**Evidence:**
- Direct SQL: **12,548** locked orders with pickup dates
- Precomputed table: **12,543** orders (pickup aggregates) -- **5 missing**
- Same 5-order gap exists for delivery aggregates

**Impact example (Feb 16-22 week):**
| Dispatcher | Precomputed | Direct SQL | Missing |
|---|---|---|---|
| Jovan Nesovic-Jonny | $40,600 (22) | $41,600 (23) | $1,000 (1 order) |
| Ilija Gajic-Elijah | $30,775 (16) | $32,025 (17) | $1,250 (1 order) |
| Milos Jankovic-Ramsey | $24,950 (13) | $26,930 (14) | $1,980 (1 order) |
| Vukasin Krdzic-Vincent | $9,360 (6) | $11,679 (7) | $2,319 (1 order) |

The issue is traced to the recompute function's use of **offset-based pagination** (`.range(offset, offset + BATCH - 1)`) combined with the `.or("canceled.eq.false,tonu.gt.0,tonu_driver.gt.0")` filter. PostgREST's `.range()` can drop rows at page boundaries when used with complex filter predicates.

## Solution

Replace offset-based pagination with **cursor-based (keyset) pagination** in the recompute function. Instead of `.range(offset, offset + BATCH - 1)`, use `.gt("id", lastSeenId)` to ensure no rows are ever skipped.

## Changes

### 1. `supabase/functions/recompute-analytics-aggregates/index.ts`

Replace the order fetching loop (currently using `.range(offset, offset + BATCH - 1)`) with cursor-based pagination:

```text
Before:
  let offset = 0;
  while (true) {
    query.range(offset, offset + BATCH - 1);
    ...
    offset += orders.length;
  }

After:
  let lastId = "00000000-0000-0000-0000-000000000000";
  while (true) {
    query.gt("id", lastId).limit(BATCH);
    ...
    lastId = orders[orders.length - 1].id;
  }
```

This requires adding `id` to the `SELECT_COLS` list so the cursor value is available.

### 2. Re-deploy and re-run

After deploying the fixed function, trigger a recompute to rebuild all 12,548 orders correctly.

### 3. Validation

Run the validate-analytics-aggregates function to confirm 0 mismatches after recompute.

## Technical Details

- The `SELECT_COLS` in the `aggregateOrders` function needs to include `"id"` so `lastId` can be extracted from each batch
- The `.order("id", { ascending: true })` is already present, which is required for cursor pagination to work correctly
- The `.limit(BATCH)` replaces `.range()` -- it returns at most BATCH rows starting after the cursor
- The break condition remains `orders.length < BATCH`
- The same cursor fix should be applied to the driver data fetch in the same function (same pagination loop)

