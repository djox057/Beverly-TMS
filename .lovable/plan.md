

## Analysis: Why DH and Loaded Miles Fail on New Order

### How They're Called

**Loaded Miles** (line 396-472):
- A `useEffect` watches `[pickupsDrops, toast]`
- Fires 1500ms after `pickupsDrops` changes (debounce)
- First pass: geocodes any stops missing coordinates, calls `setPickupsDrops(updatedItems)` then **returns early** (line 431)
- The `setPickupsDrops` triggers the effect again — second pass should skip geocoding and proceed to mile calculation
- Calls `calculateLoadedMiles` (2 stops) or `calculateMultiStopMiles` (3+ stops)

**DH Miles** (line 474-520):
- A separate `useEffect` watches `[truck, lastDelivery, pickupsDrops, toast]`
- Fires 1500ms after dependencies change
- Requires a truck to be selected AND a pickup address to exist
- Calls `calculateDhMiles(lastDeliveryAddress, pickupAddress)`

### Why They Return 0

**Root cause: The `withTimeout` fallback returns `0` too aggressively.**

Each mile calculation involves 2-3 sequential network calls to the `calculate-mapbox-route` edge function:
1. Geocode address A (~1-3s)
2. Geocode address B (~1-3s)
3. Route calculation (~1-3s)

Total: 3-9 seconds. But `withTimeout` is set to **8 seconds** for single routes and the geocoding in the effect already consumed time before the mile calc starts. When the timeout fires, the fallback value `0` is returned silently.

**Additionally, the geocode-first-then-return pattern causes a race:**
- First render: geocode runs, sets state, returns early (no mile calc)
- State change triggers DH effect too (pickupsDrops changed)
- Both effects now fire simultaneously after 1500ms
- The loaded miles effect runs the calculation for real this time
- But the DH effect was ALSO re-triggered and may overlap with loaded miles, hitting Mapbox rate limits

### Fix Plan

**File: `src/utils/mapboxRouteCalculator.ts`**

1. **Increase `withTimeout` from 8s→15s for single routes, 12s→20s for multi-stop** — the calculations are sequential (geocode + geocode + route), each taking 1-3s. 8s is too tight.

**File: `src/pages/NewOrder.tsx`**

2. **Deduplicate geocoding** — The loaded miles effect geocodes addresses, then the mile calculation re-geocodes them via `calculateLoadedMiles` (which calls `geocodeAddress` internally). The effect should pass the already-geocoded coordinates directly to a route calculation instead of re-geocoding.

3. **Stagger DH and loaded miles calculations** — Both effects fire when `pickupsDrops` changes. Add a guard so DH calculation waits until loaded miles calculation completes (or use a ref to track calculation state).

4. **Skip re-geocoding in calculateLoadedMiles/calculateDhMiles** — Since the effect already geocodes and stores lat/lon on the pickupsDrops items, pass coordinates directly to the route API instead of re-geocoding addresses. This cuts the time from ~6-9s to ~1-3s.

### Specific Changes

**`mapboxRouteCalculator.ts`**: Increase timeouts to 15s/20s as a safety net.

**`NewOrder.tsx` (lines 396-472)**: After geocoding completes and coordinates exist on all stops, call the route API directly with coordinates instead of calling `calculateLoadedMiles(address1, address2)` which re-geocodes. Use `supabase.functions.invoke('calculate-mapbox-route', { body: { type: 'route', start, end } })` with the stored coordinates.

**`NewOrder.tsx` (lines 474-520)**: Similarly for DH miles — if the first pickup already has coordinates from the geocode pass, use them directly instead of re-geocoding the address string.

This eliminates 2-4 redundant geocode API calls per order, bringing total time from ~6-9s down to ~2-4s, well within timeout bounds.

