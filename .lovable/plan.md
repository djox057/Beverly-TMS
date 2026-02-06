

# Phase 3D: Eliminate RLS Amplification on Trucks/Drivers/Weekly Plans

## Root Cause (Confirmed)

The 504 timeouts and 70-100% CPU are caused by **RLS policy amplification through lateral joins**. Here is the exact chain:

1. `useTrucks.ts` fetches 268 trucks with 4 lateral joins (trailers, driver1, driver2, company)
2. Each joined table has its own RLS SELECT policy that calls `has_any_role()`
3. `has_any_role()` calls `auth_user_roles()` which queries the `user_roles` table
4. PostgreSQL evaluates RLS on EVERY row of EVERY joined table
5. Result: a single truck list fetch triggers ~1,300 RLS evaluations (268 trucks x 5 tables), each querying `user_roles`

With 50 concurrent users, that is **65,000 user_roles lookups per page load**. This saturates the connection pool and causes the timeout cascade.

The same pattern affects:
- `useDrivers.ts` -- fetches all 659 drivers + all 268 trucks (with trailer join)
- `useWeeklyPlans.ts` -- queries with `driver_id.in.(...)` containing hundreds of IDs
- `useDashboard.ts` -- 4 separate `COUNT(*)` queries, each evaluating RLS per row
- `useReportsDateWindowAdapter.ts` -- fetches all trucks with `select("*")`

## Solution: Apply Flat + Batch Pattern to All Remaining Heavy Queries

The same fix that worked for orders: replace multi-join queries with flat fetches + separate batch lookups. This reduces RLS evaluations from O(rows x joins) to O(rows) per table.

### Fix 1: Rewrite `useTrucks.ts` (THE BIGGEST OFFENDER)

Remove the 4-way lateral join. Fetch trucks flat, then batch-fetch related entities.

**Before (1 query, 4 joins, ~1,300 RLS evaluations):**
```
select *, trailer:trailers(...), driver1:drivers!...(...), driver2:drivers!...(...), company:companies(...)
from trucks order by truck_number
```

**After (5 simple queries, ~268 + ~268 + ~268 + ~268 + ~50 RLS evaluations, all in parallel):**
```
-- Query 1: Flat trucks
select * from trucks order by truck_number

-- Query 2-5: Batch fetch by collected IDs (parallel)
select id, trailer_number, trailer_type from trailers where id in (...)
select id, name, dispatcher_id, company_id from drivers where id in (...)
select id, name from companies where id in (...)
select user_id, full_name, email from profiles
```

### Fix 2: Rewrite `useDrivers.ts`

Same pattern. Currently fetches all drivers with company join, then all trucks with trailer join. Replace with flat fetches.

### Fix 3: Optimize `useDashboard.ts` Counts

Change all 4 count queries from `select('*', { count: 'exact', head: true })` to `select('id', { count: 'exact', head: true })`. This avoids PostgREST evaluating RLS on joined columns.

### Fix 4: Optimize `useReportsDateWindowAdapter.ts` Trucks Query

The adapter query at line 361-365 fetches `select("*")` from trucks. Change to only select needed columns: `select("id, truck_number, driver1_id, driver2_id, trailer_id, is_active, status, company_id, latitude, longitude, last_location_update, location_city, location_state")`.

### Fix 5: Fix `useReportsDateWindow.ts` fetchDriverIdsForOffice

The trucks query at line 480-488 uses a join to drivers:
```
select id, driver1_id, driver2_id, driver1:drivers!trucks_driver1_id_fkey(id, dispatcher_id)
from trucks where is_active = true
```
This joins drivers table (triggering drivers RLS). Replace with flat fetch + separate driver lookup.

## Technical Details

### File: `src/hooks/useTrucks.ts`

Replace the paginated join query with:
```typescript
// Stage 1: Flat trucks fetch
const { data: allTrucks } = await supabase
  .from('trucks')
  .select('*')
  .order('truck_number');

// Stage 2: Collect unique IDs
const trailerIds = [...new Set(allTrucks.filter(t => t.trailer_id).map(t => t.trailer_id))];
const driverIds = [...new Set(allTrucks.flatMap(t => [t.driver1_id, t.driver2_id]).filter(Boolean))];
const companyIds = [...new Set(allTrucks.filter(t => t.company_id).map(t => t.company_id))];

// Stage 3: Parallel batch fetches
const [trailersData, driversData, companiesData, dispatchers] = await Promise.all([
  supabase.from('trailers').select('id, trailer_number, trailer_type').in('id', trailerIds),
  supabase.from('drivers').select('id, name, dispatcher_id, company_id').in('id', driverIds),
  supabase.from('companies').select('id, name').in('id', companyIds),
  supabase.from('profiles').select('user_id, full_name, email'),
]);

// Stage 4: Build Maps and assemble
```

### File: `src/hooks/useDrivers.ts`

Same pattern -- flat drivers fetch, then separate trucks + trailers + profiles + companies fetches. Remove the inline truck-with-trailer-join.

### File: `src/hooks/useDashboard.ts`

4 line changes: `select('*', ...)` to `select('id', ...)`.

### File: `src/hooks/useReportsDateWindowAdapter.ts`

Line 363: Change `select("*")` to `select("id, truck_number, driver1_id, driver2_id, trailer_id, is_active, status, company_id, latitude, longitude, last_location_update, location_city, location_state")`.

### File: `src/hooks/useReportsDateWindow.ts`

Line 480-488: Replace the join query with flat truck fetch + separate driver dispatcher lookup.

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useTrucks.ts` | Replace 4-join query with flat + batch pattern |
| `src/hooks/useDrivers.ts` | Replace truck+trailer join with flat + batch pattern |
| `src/hooks/useDashboard.ts` | Change `select('*')` to `select('id')` in all 4 count queries |
| `src/hooks/useReportsDateWindowAdapter.ts` | Reduce trucks `select("*")` to only needed columns |
| `src/hooks/useReportsDateWindow.ts` | Replace trucks+drivers join with flat + batch |

## Expected Impact

- RLS evaluations per user page load: from ~1,300 to ~268 (trucks) + ~268 (trailers) + ~150 (drivers) = ~686 (47% reduction per table fetch)
- More importantly: no more lateral join amplification where PostgreSQL re-evaluates RLS on joined tables
- With 50 users: from ~65,000 user_roles lookups to ~34,300 per cycle
- Combined with Phase 3C fixes: CPU should stabilize under 20% at 50 users
