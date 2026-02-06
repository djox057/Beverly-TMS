

# Phase 3F: Stop the Realtime Cascade Loop and Remaining Joins

## Root Cause: Realtime Event Cascade

The screenshot proves it: **2,431 GET requests** to `/orders?select=*,pickup_drops(...)` in 10 minutes = ~4 requests per second. This is an infinite cascade loop, not normal polling.

Here is the cascade chain:

```text
Any order change in the database
  |
  +--> useOrdersRealtime: fetches single order (10+ parallel queries)
  +--> useDashboard: invalidateQueries -> refetches 4 count queries + recent orders with joins
  +--> useRecoveryTrucks: invalidateQueries -> refetches ALL trucks + orders with pickup_drops joins
  +--> useYardLoadsFromOrders: (if active) refetches with 7 joins
  |
  v
  Each refetch creates database load, which combined with RLS evaluation, causes timeouts
  Timeouts cause retries (React Query default: 3 retries)
  Retries create more load -> more timeouts -> more retries
  The system enters a self-sustaining overload loop
```

Additionally, the `useTrucksRealtime` and `useDriversRealtime` hooks listen to overlapping tables (`trucks`, `drivers`, `trailers`, `companies`), so a single driver change triggers BOTH hooks, each running their own expensive fetch sequences.

## Fixes (in priority order)

### Fix 1: Remove `invalidateQueries` from ALL realtime subscriptions

Replace `invalidateQueries` (which triggers expensive refetches) with direct cache patching (`setQueryData`) or simply debounce/throttle the invalidation. Specifically:

- **`useRecoveryTrucks.ts`**: Remove the realtime subscription entirely. It subscribes to ALL `orders` changes just to refetch recovery trucks. Replace with 30-second staleTime (already has staleTime: 30000) and no realtime. Recovery data doesn't need instant updates.
- **`useDashboard.ts`**: Remove the realtime subscriptions on `orders`, `trucks`, `drivers`, `brokers`. Dashboard stats don't need instant updates. Use staleTime + refetchInterval instead (e.g., every 60 seconds).
- **`useYardLoadsFromOrders.ts`**: Already uses refetchInterval: 120000. No changes needed, but the joined query must be converted to flat+batch.

### Fix 2: Convert remaining joined queries to flat+batch

These are the hooks still using lateral joins:

**`useYardLoadsFromOrders.ts`** (7 joins, polls every 2 min):
Replace with flat orders fetch + parallel batch fetches for trailers, brokers, companies, drivers, trucks, and pickup_drops.

**`useRecoveryTrucks.ts`** (6 joins on trucks + pickup_drops join on orders):
Replace with flat trucks fetch + batch entities. Replace orders query with flat + separate pickup_drops fetch.

**`useDashboard.ts` `fetchRecentOrders`** (2 joins: trucks + pickup_drops):
Replace with flat orders fetch + batch truck lookup + separate pickup_drops query.

**`useExpiringAlerts.ts`** (3 joins on trucks: driver1 with company, driver2, company):
Replace with flat trucks fetch + batch driver/company lookups.

**`useRepairs.ts`** (3 joins: trucks, trailers, drivers):
Replace with flat repairs fetch + batch entity lookups.

**`useTrucksRealtime.ts`** (4 joins in fetchSingleTruck):
Replace with flat truck fetch + parallel entity lookups.

**`useDriversRealtime.ts`** (company join + truck/trailer join):
Replace with flat driver fetch + separate truck and company lookups.

**`useAvailableTrucks.ts`** (1 join: drivers):
Replace with flat trucks fetch + batch driver lookup.

### Fix 3: Fix remaining `select("*")` count queries

**`useYardLoadsCount.ts`**: Change `select("*", { count: "exact", head: true })` to `select("id", { count: "exact", head: true })`.

### Fix 4: Remove `fetchPreviousWeekLastDelivery` inner join in Trips.tsx

The `pickup_drops!inner(datetime, type)` join at line 120 should be replaced with a separate pickup_drops query.

## Technical Details

### File: `src/hooks/useRecoveryTrucks.ts`
- Remove entire realtime subscription (lines 8-50)
- Replace trucks query (lines 56-69) with flat + batch
- Replace orders query (lines 85-94) with flat + separate pickup_drops
- Add refetchInterval: 60000 for periodic refresh

### File: `src/hooks/useDashboard.ts`
- Remove realtime subscriptions from `useDashboardStats` (lines 86-112) and `useRecentOrders` (lines 131-148)
- Replace `fetchRecentOrders` joined query (lines 60-76) with flat + batch
- Add refetchInterval: 60000 to both hooks

### File: `src/hooks/useYardLoadsFromOrders.ts`
- Replace 7-join query (lines 68-128) with flat orders fetch + parallel batch fetches
- Keep existing refetchInterval: 120000

### File: `src/hooks/useYardLoadsCount.ts`
- Line 10: Change `select("*"` to `select("id"`

### File: `src/hooks/useExpiringAlerts.ts`
- Replace trucks query (lines 10-18) with flat + batch

### File: `src/hooks/useRepairs.ts`
- Replace repairs query (lines 67-75) with flat + batch

### File: `src/hooks/useTrucksRealtime.ts`
- Replace `fetchSingleTruck` (lines 23-91) with flat truck fetch + parallel entity lookups

### File: `src/hooks/useDriversRealtime.ts`
- Replace `fetchSingleDriver` (lines 23-116) with flat driver fetch + separate entity lookups
- Remove the `user_roles` + `profiles` round-trip in `has_account` check (lines 83-101); use cached data from the main drivers query instead

### File: `src/hooks/useAvailableTrucks.ts`
- Replace trucks+drivers join with flat + batch

### File: `src/pages/Trips.tsx`
- Replace `fetchPreviousWeekLastDelivery` (lines 114-123) pickup_drops!inner join with flat + separate query

## Files Changed

| File | Change | Impact |
|---|---|---|
| `src/hooks/useRecoveryTrucks.ts` | Remove realtime sub + flat+batch queries | Stops biggest loop contributor |
| `src/hooks/useDashboard.ts` | Remove realtime subs + flat+batch fetchRecentOrders + add refetchInterval | Stops cascade amplifier |
| `src/hooks/useYardLoadsFromOrders.ts` | Flat+batch query | Eliminates 7-join RLS amplification |
| `src/hooks/useYardLoadsCount.ts` | select("id") instead of select("*") | Minor optimization |
| `src/hooks/useExpiringAlerts.ts` | Flat+batch query | Eliminates 3-join RLS amplification |
| `src/hooks/useRepairs.ts` | Flat+batch query | Eliminates 3-join RLS amplification |
| `src/hooks/useTrucksRealtime.ts` | Flat+batch fetchSingleTruck | Eliminates 4-join per realtime event |
| `src/hooks/useDriversRealtime.ts` | Flat+batch fetchSingleDriver | Eliminates joins + user_roles storm |
| `src/hooks/useAvailableTrucks.ts` | Flat+batch query | Eliminates 1-join RLS amplification |
| `src/pages/Trips.tsx` | Replace pickup_drops!inner join | Eliminates join in per-truck query |

## Expected Outcome

- The realtime cascade loop is broken by removing `invalidateQueries` from subscriptions
- ALL remaining client-side queries become single-table index lookups
- Zero lateral joins remain anywhere in the frontend
- CPU should drop to 5-10% with 1 user and stay under 30% with 50+ users
- The "works for a few minutes then crashes" pattern stops permanently
