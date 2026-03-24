

## Fix: Billboard "Top 5 by Gross" missing dispatchers due to truck count data gaps

### Problem
Anastasija Jankovic-Stacy is excluded from "Top 5 Dispatchers by Gross" because:
1. The `dispatcher_daily_driver_counts` cron records dates in UTC, not Chicago time
2. She has data through March 22 but not March 23 (while other dispatchers do have March 23 data)
3. The Billboard queries truck counts for the current week (March 23-29). Since other dispatchers have data, the global fallback never triggers. Her individual `avgTrucks` resolves to 0.
4. The `>= 4.8` truck filter removes her.

### Root cause
The `computeAvgCounts` in `Billboard.tsx` only averages rows present in the query result. If a dispatcher has zero rows in the date range, they get `avgTrucks = 0` — there's no per-dispatcher fallback.

### Fix (single file: `src/pages/Billboard.tsx`)

**Change the truck count fetching logic** (lines 68-126) to add a per-dispatcher fallback:

After the primary query returns data, identify dispatchers who appear in orders but have no truck count rows. For those dispatchers, query their most recent `dispatcher_daily_driver_counts` entry and use that value as their `avgTrucks`.

Concretely:
1. After `setDispatcherTruckCounts(computeAvgCounts(data))`, check if any dispatchers from the current week's orders are missing from the result.
2. For missing dispatchers, fetch their latest single row from `dispatcher_daily_driver_counts` ordered by `date DESC` limit 1.
3. Merge those values into the truck counts map.

This is a lightweight change — just extending the existing `fetchTruckCounts` function to fill gaps individually rather than relying on the all-or-nothing global fallback.

### Technical detail
- The `dispatcherStats` computation at line 320 builds the list of active dispatcher names from orders.
- The profile map at line 338 resolves name → userId.
- We need to cross-reference: for each dispatcher in `dispatcherStats` whose userId has no entry in `dispatcherTruckCounts`, fetch their latest count.
- Since `dispatcherStats` depends on `dispatcherTruckCounts`, the fallback fetch must happen inside the same `useEffect` that sets `dispatcherTruckCounts`, using the profile map to find all relevant dispatcher user IDs.

Alternative simpler approach: after the initial query, fetch the latest 7 days of data (regardless of week bounds) for ALL dispatchers as a fallback pool, then merge — prioritizing current-week data but filling gaps from the fallback pool. This avoids per-dispatcher queries.

