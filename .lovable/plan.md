

# Phase 3E: Eliminate ALL Remaining 14-Join Queries

## Problem

The Phase 3C/3D fixes only covered `useOrdersRealtime`, `useOrdersSearch`, `useOrdersProgressive`, `useTrucks`, `useDrivers`, and `useDashboard`. But **6 more hooks** still fire massive lateral-join queries through RLS, causing the same "statement timeout" cascade that saturates CPU to 100%.

The database logs confirm: statement timeouts are STILL happening dozens per second.

## Remaining Offenders (in order of severity)

### 1. `useReports.ts` - Trucks query (line 918-929) -- CRITICAL
Fires every 2 minutes (refetchInterval: 120000). Fetches ALL trucks with 4 lateral joins:
- `driver1:drivers(15+ columns, company:companies(...))`
- `driver2:drivers(15+ columns, company:companies(...))`
- `trailer:trailer_id(...)`
- `company:companies(...)`

With 268 trucks, this triggers ~1,300+ RLS evaluations per call. Two instances run (priority + background), so this alone fires ~2,600 RLS evaluations every 2 minutes.

### 2. `useReports.ts` - Orders query (line 975-1111) -- CRITICAL
Fires every 2 minutes. Fetches ALL unlocked orders (600+) with 10 lateral joins including nested company sub-joins. Each order triggers 10+ RLS lookups = ~6,000+ RLS evaluations per call. Batched in 1000s, but each batch is a monster query.

### 3. `useUnlockedOrdersPagination.ts` (line 53 + 155-191)
Full 14-join query on every page load. `select("*")` count query evaluates all columns through RLS.

### 4. `useTripsLazyOrders.ts` (line 223-260)
Full 14-join query triggered on every Trips page search.

### 5. `NestedDriverTripsDropdown.tsx` (line 125-155)
10-join query triggered when expanding driver trips dropdown (used in Reports and Trips pages).

### 6. `useLumperMissingRevisedRC.ts` (line 34-45)
Joins drivers, trucks, and order_files. Smaller but still contributes to RLS overhead.

## Solution: Convert All to Flat + Batch Pattern

### Fix 1: `useReports.ts` Trucks Query
Replace the 4-join trucks query with flat fetch + parallel batch lookups (same pattern as the useTrucks fix from Phase 3D).

Before:
```
select *, driver1:drivers!...(15 cols, company:companies(...)), driver2:drivers!...(...), trailer:trailer_id(...), company:companies(...)
from trucks
```

After:
```
-- Query 1: Flat trucks
select * from trucks order by id

-- Parallel batch queries:
select id, name, phone, email, ... from drivers where id in (driver1_ids + driver2_ids)
select id, name from companies where id in (company_ids)
select id, trailer_number, dot_inspection_date from trailers where id in (trailer_ids)
-- Assemble manually
```

### Fix 2: `useReports.ts` Orders Query
Replace the 10-join orders query with the same flat + batch pattern already used in `useReportsDateWindow.ts`. The orders query at line 975-1111 still has joins for broker, company, truck, trailer, driver1, driver2. Convert to flat fetch + batch entity lookups.

Before:
```
select id, ..., pickup_drops(...), order_files(...), order_transfers(...),
  broker:brokers(...), company:companies!...(...), truck:trucks!...(company:companies(...)),
  trailer:trailers!...(...), driver1:drivers!...(company:companies(...)), driver2:drivers!...(company:companies(...))
from orders where locked = false
```

After:
```
-- Query 1: Flat orders (with pickup_drops, order_files, order_transfers as separate queries)
select [flat columns] from orders where locked = false

-- Parallel relation queries by order_id:
select * from pickup_drops where order_id in (...)
select id, file_category, file_name, file_path from order_files where order_id in (...)
select id, ... from order_transfers where order_id in (...)

-- Parallel entity queries by collected IDs:
select id, name, ... from brokers where id in (...)
select id, name from companies where id in (...)
select id, truck_number from trucks where id in (...)
select id, trailer_number from trailers where id in (...)
select id, name, company_id from drivers where id in (...)
```

### Fix 3: `useUnlockedOrdersPagination.ts`
- Change `select("*", { count: "exact", head: true })` to `select("id", ...)`
- Replace 14-join query with flat + batch pattern

### Fix 4: `useTripsLazyOrders.ts`
Replace `getOrderSelectQuery()` (14-join) with flat + batch pattern for the search results (limited to 50 orders).

### Fix 5: `NestedDriverTripsDropdown.tsx`
Replace 10-join query with flat + batch pattern (limited to 50 orders).

### Fix 6: `useLumperMissingRevisedRC.ts`
Replace joined query with flat orders fetch + separate driver/truck lookups.

## Technical Details

All fixes follow the identical pattern:

```text
Stage 1: Flat fetch (single table, no joins)
  |
Stage 2: Collect unique IDs from results
  |
Stage 3: Parallel batch fetch entities (Promise.all)
  |
Stage 4: Build lookup Maps and manually assemble objects
```

## Files Changed

| File | Change | Impact |
|---|---|---|
| `src/hooks/useReports.ts` | Replace trucks 4-join + orders 10-join with flat + batch | Eliminates ~8,600 RLS evaluations per 2-min cycle |
| `src/hooks/useUnlockedOrdersPagination.ts` | Replace 14-join + optimize count | Eliminates ~1,400 RLS evaluations per page load |
| `src/hooks/useTripsLazyOrders.ts` | Replace 14-join getOrderSelectQuery() | Eliminates ~700 RLS evaluations per search |
| `src/components/NestedDriverTripsDropdown.tsx` | Replace 10-join query | Eliminates ~500 RLS evaluations per dropdown open |
| `src/hooks/useLumperMissingRevisedRC.ts` | Replace joined query | Minor RLS reduction |

## Expected Outcome

- ALL client-side PostgREST queries become single-table index lookups
- Zero lateral joins going through RLS from the frontend
- Statement timeouts should stop completely
- CPU should stabilize at 5-15% with 50+ users
- The "works for a few minutes then crashes" pattern stops because polling queries no longer cascade into timeouts
