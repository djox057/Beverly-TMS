
# Phase 3C: Fix Statement Timeout Storm (Root Cause)

## Root Cause Analysis

The database is flooded with "canceling statement due to statement timeout" errors -- dozens per second. This is NOT caused by the edge functions (those use service role and are fast). The timeout storm comes from **three client-side hooks** that execute expensive PostgREST queries with 14+ lateral joins through RLS:

### Source 1: `useOrdersRealtime.ts` (lines 22-55) -- THE BIGGEST OFFENDER
Every time ANY order, pickup_drop, order_transfer, or order_file changes in the database, this hook calls `fetchSingleOrder()` which executes a massive SELECT with 14 joins:
- `pickup_drops (*)`
- `order_transfers (*, driver1, driver2, truck, trailer)` -- 4 sub-joins
- `recovery_history (*, recovery_driver1, recovery_driver2, recovery_truck, recovery_trailer)` -- 4 sub-joins  
- `broker, company, booked_by_company, truck (with company), trailer, driver1 (with company), driver2 (with company), original_driver1, original_driver2, original_truck, original_trailer`

With 10+ users online, every order edit triggers this fetch for EACH user. At peak, this creates dozens of concurrent 14-join queries through RLS, each timing out and holding connections.

### Source 2: `useOrdersSearch.ts` (lines 91-129)
Same 14-join monster query, triggered every time a user types in the search box (after 2 characters). Multiple dispatchers searching simultaneously = more timeout-prone queries.

### Source 3: `useOrdersProgressive.ts` (lines 88-99)
Two `COUNT(*)` queries with `select("*", { count: "exact", head: true })` on every page load. These scan the full orders table through RLS.

## The Fix: Replace 14-Join Queries with Flat + Batch Pattern

Apply the same Stage 1 (flat) -> Stage 2 (batch relations) pattern that already works in the edge functions to all three client-side hooks.

### Fix 1: Slim down `useOrdersRealtime.ts` fetchSingleOrder

Replace the 14-join SELECT with a flat order fetch + parallel batch fetches for relations. Since this is a single order, the batching is trivial (1 ID per query).

```
// BEFORE: 14 lateral joins (causes timeout under load)
.select(`*, pickup_drops (*), order_transfers (*, driver1:drivers!..., ...), ...`)

// AFTER: Flat fetch + parallel relation queries
const order = await supabase.from("orders").select(FLAT_COLUMNS).eq("id", orderId).single();
const [pickupDrops, orderFiles, orderTransfers, ...] = await Promise.all([
  supabase.from("pickup_drops").select("*").eq("order_id", orderId),
  supabase.from("order_files").select("id, file_category, file_name, file_path").eq("order_id", orderId),
  supabase.from("order_transfers").select("*").eq("order_id", orderId),
]);
// Fetch entity lookups (truck, driver, broker, company) individually
const [truck, driver1, driver2, broker, company] = await Promise.all([
  order.truck_id ? supabase.from("trucks").select("id, truck_number, company_id").eq("id", order.truck_id).single() : null,
  order.driver1_id ? supabase.from("drivers").select("id, name, company_id").eq("id", order.driver1_id).single() : null,
  // ... etc
]);
// Manually assemble the nested object
```

Each individual query is trivially fast (index lookup, no joins, no RLS subquery storm).

### Fix 2: Slim down `useOrdersSearch.ts`

Same approach -- replace the 14-join SELECT with flat + batch. Search results are limited to 100 orders, so the batch fetches are small.

```
// Stage 1: Flat order search (fast, index-friendly)
const { data: flatOrders } = await supabase
  .from("orders")
  .select(FLAT_COLUMNS)
  .or(searchFilter)
  .limit(100);

// Stage 2: Batch fetch relations for the 100 results
const orderIds = flatOrders.map(o => o.id);
const [pickupDrops, orderFiles, transfers] = await Promise.all([...]);

// Stage 3: Batch fetch entities (trucks, drivers, brokers, companies)
const truckIds = collectUniqueIds(flatOrders, "truck_id");
const [trucksMap, driversMap, brokersMap, ...] = await Promise.all([...]);

// Assemble and transform
```

### Fix 3: Optimize `useOrdersProgressive.ts` count queries

Replace `select("*", { count: "exact", head: true })` with `select("id", { count: "exact", head: true })`. Using `*` forces PostgREST to evaluate all columns through RLS even though `head: true` discards the rows. Using `id` is sufficient for counting.

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useOrdersRealtime.ts` | Replace 14-join `fetchSingleOrder` with flat + parallel batch pattern |
| `src/hooks/useOrdersSearch.ts` | Replace 14-join search query with flat + batch pattern |
| `src/hooks/useOrdersProgressive.ts` | Change `select("*")` to `select("id")` in count queries |

## Expected Outcome

- Each individual query completes in under 50ms (single-table index lookups)
- No more 14-join queries going through RLS
- Statement timeouts stop immediately
- CPU drops from 99% to under 10% at steady state
- All relational data (truck#, driver, broker, company) still displays correctly
