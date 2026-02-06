

# Phase 3: Performance Optimization

## What This Fixes
Statement timeouts are still occurring on two specific queries: the locked-orders Edge Function (14 nested joins on 12k+ rows) and the lumper missing-RC query (no index on `lumper > 0`). This phase eliminates both.

## Step 1: Database Indexes (Immediate Relief)

Add three targeted partial indexes to support the heaviest query patterns:

| Index | Purpose |
|---|---|
| `idx_orders_locked_true_created` on `orders(created_at DESC) WHERE locked = true` | Covers the locked-orders Edge Function, which currently does a sequential scan on 12k+ rows |
| `idx_orders_lumper_created` on `orders(created_at) WHERE lumper > 0` | Covers `useLumperMissingRevisedRC` which filters on `lumper > 0` with no index |
| `idx_orders_locked_driver1_pickup` on `orders(driver1_id, pickup_datetime DESC) WHERE locked = true` | Covers Reports page locked-orders-by-driver fetches |

No indexes will be dropped -- production stats confirmed all existing indexes are actively used.

## Step 2: Slim `get-all-locked-orders` Edge Function

Current state: `SELECT *` with 14 nested joins (broker, company, truck with company sub-join, trailer, driver1 with company, driver2 with company, original_driver1/2, original_truck/trailer, recovery_history with 4 sub-joins, order_transfers with 4 sub-joins, pickup_drops, order_files). Each join creates lateral subqueries multiplied across 12k+ locked rows.

New two-stage approach:
1. Fetch flat order columns only (no joins) with pagination
2. Collect all order IDs from the batch
3. Three parallel `.in()` batch queries for `pickup_drops`, `order_files`, and `order_transfers` (flat columns only, no sub-joins)
4. Group results by `order_id` using a Map, attach to orders before returning

All other joins removed entirely (broker, company, truck, trailer, driver1/2, original_*, recovery_history) -- callers already resolve these from cached data in `useDrivers`, `useTrucks`, etc., and `transformOrders` gracefully handles missing join data via `deleted_*` fallback fields.

Performance logging will be added at each stage to verify the "under 1s" target.

## Step 3: Slim `get-all-unlocked-orders` Edge Function

Identical refactor as Step 2 -- same 14-join query structure, same two-stage pattern. Fewer rows (~660 unlocked) but same CPU cost per row.

## Step 4: Deduplicate `truck_notes` and Add Unique Constraint

Production data shows 2 drivers with duplicate notes (one has 38 duplicates, one has 3). The root cause is the upsert code in `useReports.ts` which does not use `onConflict` -- it checks for existence and inserts, creating a race condition window.

Migration will:
1. Delete all but the most recently updated note per driver
2. Add `UNIQUE(driver_id)` constraint
3. Update the mutation code in `useReports.ts` to use proper upsert with `onConflict: 'driver_id'`

## What We Are NOT Doing

- **Dropping indexes**: Production stats show all existing indexes are heavily used
- **Removing the legacy `useReports.ts` fetch path**: It is already fully guarded by `disableFetch: true` when the date-window adapter is active (confirmed in code). No additional guard needed.
- **Staged rollout with v2 Edge Functions**: The response shape stays compatible -- `transformOrders` already handles missing join data via null checks and `deleted_*` fallbacks. A direct update is safe.

## Technical Details

### Edge Function batch pattern (Steps 2/3)

```text
// Stage 1: Flat orders
const { data: orders } = await supabase
  .from("orders")
  .select("id, load_number, internal_load_number, ...")  // flat columns only
  .eq("locked", true)
  .range(offset, offset + limit - 1);

// Stage 2: Batch relations using .in()
const orderIds = orders.map(o => o.id);

const [pickupDrops, orderFiles, transfers] = await Promise.all([
  supabase.from("pickup_drops").select("...").in("order_id", orderIds),
  supabase.from("order_files").select("...").in("order_id", orderIds),
  supabase.from("order_transfers").select("...").in("order_id", orderIds),
]);

// Stage 3: Group and attach
const pdMap = new Map();
for (const pd of pickupDrops.data) {
  if (!pdMap.has(pd.order_id)) pdMap.set(pd.order_id, []);
  pdMap.get(pd.order_id).push(pd);
}
// ... same for files and transfers

orders.forEach(order => {
  order.pickup_drops = pdMap.get(order.id) || [];
  order.order_files = ofMap.get(order.id) || [];
  order.order_transfers = otMap.get(order.id) || [];
});
```

### Rollback SQL (if indexes cause issues)

```text
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_locked_true_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_lumper_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_locked_driver1_pickup;
```

### Files Changed

| File | Change |
|---|---|
| Migration SQL | 3 new indexes + truck_notes dedup + unique constraint |
| `supabase/functions/get-all-locked-orders/index.ts` | Replace 14-join SELECT with two-stage flat+batch pattern |
| `supabase/functions/get-all-unlocked-orders/index.ts` | Same refactor |
| `src/hooks/useReports.ts` | Change truck_notes insert to upsert with `onConflict: 'driver_id'` |

### Implementation Order

1. Database migration (indexes + truck_notes) -- immediate timeout relief, zero risk
2. Edge Function refactoring (both functions) -- main performance improvement
3. useReports.ts upsert fix -- prevents future duplicates

