Root cause found: the GPS for truck 20768 is good, but the destination coordinate saved for its Cartersville, GA delivery is invalid:

```text
Truck GPS:      34.443785, -84.915464  (near Cartersville/Rome, GA)
Delivery stop:  64.635868, -153.180997 (Alaska)
Displayed:      4497 miles away
```

Plan:

1. **Prevent bad distance writes in `update-truck-distances`**
   - Validate pickup/delivery coordinates before calculating `miles_away`.
   - Reject coordinates outside the continental U.S.
   - Reject coordinates that do not match the stop’s state when a state is present.
   - If destination coordinates are invalid, do not calculate a large fake number; clear `miles_away`/`eta_minutes` for that truck instead of showing 4000+.

2. **Prevent new bad coordinates from being saved**
   - Add coordinate validation around geocoding in `NewOrder.tsx` and `EditOrder.tsx`.
   - If Mapbox returns a coordinate outside the stop’s state, discard it instead of saving it to `pickup_drops`.
   - This keeps addresses like “a, Cartersville, GA” from being saved as Alaska coordinates.

3. **Clean existing bad data**
   - Run a migration/update to null out existing `pickup_drops.latitude/longitude` values that are outside the stop’s state or outside normal U.S. bounds.
   - This will remove the bad Alaska coordinate from the current Cartersville load.

4. **Force affected miles-away values to refresh safely**
   - Clear `trucks.miles_away`/`eta_minutes` for trucks whose current active stop coordinates are invalid, including truck 20768.
   - Next scheduled distance run will calculate only when valid destination coordinates exist, so bad 4000+ values won’t return.

Technical details:

- No UI badges or labels will be added.
- The 24-hour stale-value behavior stays for missing/stale GPS.
- The new validation targets destination-stop coordinate quality, which is separate from GPS freshness.