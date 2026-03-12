

## Address Proximity Search on Reports Page

### Overview
Add a search bar to the left of the Legend button that lets users enter an address, geocodes it via Mapbox, then finds all drivers whose last delivery drop is within 150 miles using the same **Haversine × 1.3** formula used by `update-truck-distances`.

### Implementation

#### 1. Search bar UI (Reports.tsx, ~line 3320)
- Add an `Input` with `Search` icon (`w-[220px]`) to the left of the Legend button inside the `ml-auto` div
- On Enter key, trigger the search flow
- New state: `proximityAddress` (string), `proximitySearching` (boolean), `proximityResults` (array), `proximityDialogOpen` (boolean)

#### 2. Search flow (on Enter)
1. **Geocode** the entered address using existing `geocodeAddress()` from `src/utils/mapboxRouteCalculator.ts` (calls the Mapbox edge function)
2. **Collect last delivery stops**: iterate `groupedReports` → all trucks → `truck.allOrders` → sort by pickup_datetime → get last order's last delivery `pickup_drop` with `latitude`/`longitude`
3. **Calculate distances** client-side using Haversine × 1.3 (same formula as `update-truck-distances`):
   ```
   straightLine = haversine(searchCoords, lastDropCoords)
   roadMiles = Math.round(straightLine * 1.3)
   ```
4. **Filter** results to ≤ 150 miles, sort ascending by distance

#### 3. Results dialog
- Opens automatically after calculation
- Table columns: Truck #, Driver, Last Drop (city, state), Distance (mi)
- Title: "Drivers within 150 miles"
- Shows count of matching drivers

#### 4. Haversine helper
Add a small `haversineDistance` utility function in Reports.tsx (or inline) matching the exact formula from the edge function:
```typescript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

### Key decisions
- Uses Haversine × 1.3 (same as miles_away) -- no additional Mapbox API calls beyond the initial geocode
- Only the geocode step hits the edge function; all distance math is client-side
- Uses pre-stored lat/lon from `pickup_drops` -- no geocoding needed for driver locations
- Considers last order's last delivery stop per truck (sorted by pickup_datetime, last delivery by sequence_number)
- No edge function changes needed

