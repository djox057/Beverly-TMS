

# Replace OSRM with Haversine Distance in Truck Distance Functions

## Summary
Replace all external OSRM routing API calls with a pure-math Haversine distance formula (x 1.3 road correction factor) for the "miles away" dashboard indicator. This eliminates external API dependencies, retry logic, and batch throttling.

## Why This Works
"Miles away" is a dispatcher glance metric. Haversine x 1.3 is within 10-15% of actual road distance for US routes. The difference between 247 vs 270 miles doesn't change dispatcher decisions.

## Changes

### 1. `supabase/functions/update-truck-distances/index.ts` (rewrite)

**Remove:**
- `callOSRM` function (lines 53-85) with retry logic, exponential backoff
- `OSRM_BATCH_SIZE`, `OSRM_RETRY_COUNT`, `OSRM_RETRY_DELAYS` constants
- `RouteResult` interface
- Batched OSRM calls loop (Step 4, lines 299-335) with 100ms inter-batch delays
- Separate `calculatedUpdates` and `zeroMilesUpdates` arrays

**Add:**
- `haversineDistance(lat1, lon1, lat2, lon2)` pure math function
- Single loop that classifies trucks AND computes distance in one pass
- ETA estimate: `Math.round(roadMiles / 45 * 60)` (45 mph average)
- Road correction: `Math.round(straightLineMiles * 1.3)`

**Keep unchanged:**
- Advisory lock logic (concurrency guard)
- Samsara locations fetch (Step 1)
- Trucks + orders fetch (Step 2)
- `findCurrentOrder`, `isZeroMilesTruck`, `getDestination` functions
- DB batch update logic (Step 5 becomes Step 4)
- Error handling with lock release

### 2. `supabase/functions/calculate-distances-batch/index.ts` (rewrite)

**Remove:**
- `calculateDistance` async function with OSRM fetch
- Batch processing with 100ms delays between groups of 10
- `Promise.all` batching logic

**Add:**
- Same `haversineDistance` function
- Simple synchronous `.map()` over all trucks — no batching needed

### 3. `supabase/config.toml` (add entry)

Add at the end:
```toml
[functions.update-truck-distances]
verify_jwt = false
```

This function is currently missing from config.toml, meaning it may not be deployed.

### 4. NOT changed (intentionally)
- `recalculate-load-miles` — uses OSRM for billing-accurate load miles
- `calculate-mapbox-route` — client-side Mapbox for order creation
- `get-truck-distances-batch` — separate function with different purpose

## Performance Impact
- Before: 30-60s (network calls to public OSRM with retries and throttling)
- After: under 2s (pure math + DB writes only)
- Zero external routing API dependencies for the cron job

