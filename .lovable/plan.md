

# Optimize `update-truck-distances` Edge Function

## Goal
Reduce execution time from ~100s to under 25s by eliminating the double-hop routing pattern, parallelizing OSRM calls, adding retry/fallback logic, and batching DB updates.

## Changes (single file: `supabase/functions/update-truck-distances/index.ts`)

### 1. Direct OSRM calls with retry + fallback
- Replace the call to `calculate-route` edge function (lines 40-50) with a direct call to `https://router.project-osrm.org/route/v1/driving/...`
- Add retry with exponential backoff (up to 2 retries, 500ms/1000ms delays)
- On failure, return `null` instead of crashing -- the main loop will preserve the truck's **previous** `miles_away` value rather than writing null or 0

### 2. Pre-classify trucks before any I/O
After fetching Samsara locations and trucks with orders, split into two lists before making any OSRM calls:
- **`zeroMilesTrucks`**: Trucks that are Available, Maintenance, have no orders, or current order has POD. These get `miles_away = 0, eta_minutes = null` immediately with no API call.
- **`needsCalculation`**: Trucks that need an actual OSRM distance call. Each entry pre-computes the start/end coordinates and target description.

The current order selection logic (lines 307-361) stays identical -- just runs in a pure-logic pass first.

### 3. Parallel batched OSRM calls
Process `needsCalculation` trucks in parallel batches of 5:
```text
for each batch of 5 trucks:
  await Promise.all(5 OSRM calls)
  100ms delay between batches
```
If an OSRM call fails after retries, that truck is skipped (keeps its existing DB value).

### 4. Single bulk DB update via Supabase RPC
Instead of N individual UPDATE queries, collect all results into two arrays and execute two batch updates:
- One `Promise.all` of updates grouped in chunks of 10 (using `.in()` filter isn't possible for different values per row, so we'll do parallel individual updates but fire them concurrently in groups of 10 instead of sequentially)
- This reduces DB round-trips from ~50 sequential to ~5 parallel bursts

Note: A true single-query bulk upsert (`UPDATE FROM VALUES`) would require a raw SQL RPC function. Since the project avoids raw SQL in edge functions, parallel batched updates (10 at a time) is the practical approach -- still a major improvement over fully sequential.

### 5. Failure resilience
- If OSRM fails for a truck after retries, that truck's `miles_away` is **not updated** (preserves previous value)
- The function logs failures but continues processing all other trucks
- Overall function returns success even if some individual trucks failed, with counts of successes vs failures

## Summary of expected behavior

```text
Step 1: Fetch Samsara locations (existing call, ~2s)
Step 2: Fetch trucks + orders from DB (existing query, ~2s)  
Step 3: Pure logic pass -- classify all trucks, ~0s
Step 4: Batch OSRM calls, 5 parallel x ~10 batches = ~10-15s
Step 5: Batch DB updates, 10 parallel x ~5 batches = ~2s
Total: ~16-21s (down from ~100s)
```

## No other files change
The `calculate-route` edge function remains untouched -- it's still used by other parts of the app for single on-demand route calculations.

