## TRI-HAUL feature on Beverly Heatmap → Lane page

### UI changes (`src/pages/BeverlyHeatmapLane.tsx`)
- Add a **TRI-HAUL** toggle button placed right after the date range picker (next to the Search button).
- When enabled:
  - Header changes to "Tri-Haul Mode" and the existing single-lane broker table is hidden.
  - Both Pickup and Delivery locations become required.
  - Results render a new **Tri-Haul Combos** table with columns:
    - Intermediate city (X)
    - Leg 1 ($ / mi / RPM, load count)
    - Leg 2 ($ / mi / RPM, load count)
    - **Total $**, **Total Miles**, **Combined RPM**
    - Sortable by Total $ and Combined RPM (default: Total $ desc).
  - Clicking a row opens a dialog showing the underlying loads for both legs (reuse the existing orders dialog pattern).

### Backend (new edge function `supabase/functions/lane-trihaul/index.ts`)
- Inputs: `pickup {lat,lng}`, `delivery {lat,lng}`, radii, date range, `topN` (default 20).
- Algorithm:
  1. Query `pickup_drops` for all loads whose **pickup** is within radius of A → set L1 (with order_id + delivery city/state/lat/lng of that order's last delivery).
  2. Query `pickup_drops` for all loads whose **delivery** is within radius of B → set L2 (with order_id + pickup city/state/lat/lng).
  3. Cluster the L1 delivery endpoints and L2 pickup endpoints by city+state (and 0.5° geo cell as fallback). An "intermediate city X" is a cluster appearing in both L1 deliveries and L2 pickups.
  4. For each X, aggregate matching orders: average freight, average loaded_miles, RPM, load count for each leg.
  5. Combine: `total_$ = avg_leg1 + avg_leg2`, `total_miles = miles1 + miles2`, `combined_rpm = total_$ / total_miles`.
  6. Return top N intermediates sorted by total $.
- Reuse the bbox + haversine + chunked `.in(...)` patterns from `lane-search`. Same auth gate (authenticated user with any role).

### Data shape returned
```ts
{
  combos: Array<{
    intermediate: { city: string; state: string; lat: number; lng: number };
    leg1: { avg_freight: number; avg_miles: number; rpm: number; count: number; order_ids: string[] };
    leg2: { avg_freight: number; avg_miles: number; rpm: number; count: number; order_ids: string[] };
    total_freight: number;
    total_miles: number;
    combined_rpm: number;
  }>;
}
```

### Notes
- Excludes canceled orders and orders without broker (matches `lane-search`).
- Date filter applies to leg 1 pickup datetime; leg 2 has no date restriction (so we surface viable historical pairings).
- No DB schema changes required.
- Tri-Haul mode is a UI toggle on the existing page — does not affect the standard single-lane view.
