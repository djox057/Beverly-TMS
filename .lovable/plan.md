

# Fix Lane Display, Change Financial Calculations to "Next Order", and Add Sorting

## Problems Identified

1. **Lane shows "? - ?"**: The query on line 249 orders by `stop_order`, but the actual column is `sequence_number`. This causes the query to fail, returning no pickup_drops data.
2. **Avg Freight / Avg Miles / RPM**: Currently computed from the orders found near the city. The new requirement is to find each driver's **next non-canceled order** after each heatmap order and use those "next orders" for the financial metrics.
3. **No column sorting**: Users want to click City, Total, and RPM headers to sort.

## Plan

### Change 1: Fix the lane query (line 249)

Replace `.order("stop_order", ...)` with `.order("sequence_number", { ascending: true })`.

### Change 2: Move financial calculations to use "next orders"

This is the core logic change. The edge function (`compute-heatmap`) currently stores `total_freight` and `total_miles` from the heatmap orders themselves. Instead:

**Option chosen: Compute "next order" financials at query time in the frontend.** This avoids changing the edge function and keeps the heatmap recompute fast.

When fetching heatmap data for the table, after getting `order_ids` for each city:
1. Fetch those orders to get `driver1_id` and `pickup_datetime` for each.
2. For each unique driver, find the **next order** (the first non-canceled order with `pickup_datetime` strictly after the heatmap order's pickup, for the same driver).
3. Aggregate freight and miles from those "next orders" for the city's Avg Freight, Avg Miles, and RPM.
4. Drivers with no next order are skipped in the calculation (not counted in the average denominator).
5. The **Total** column remains unchanged (still shows truck count from heatmap data).

**Implementation**: Create a new `useQuery` hook that fires when `sortedCities` is ready. It:
- Collects all `order_ids` across all cities
- Fetches those orders (id, driver1_id, pickup_datetime) in chunks of 200
- For each driver+pickup_datetime pair, queries for the next order (pickup_datetime > current, canceled = false, same driver1_id, ordered by pickup_datetime ASC, limit 1)
- To avoid N+1 queries, batch this: fetch all orders for all relevant drivers ordered by pickup_datetime, then do the "next order" lookup in-memory
- Returns a map of city -> { nextOrderFreight, nextOrderMiles, nextOrderCount }

### Change 3: Add sortable columns

Add a `sortConfig` state: `{ key: 'city' | 'total' | 'rpm', direction: 'asc' | 'desc' }`.

Clicking a header toggles direction or changes the sort key. The `sortedCities` memo applies the sort accordingly. RPM sort is computed as `totalFreight / totalMiles` (using the next-order values).

## Technical Details

### File: `src/pages/BeverlyHeatmap.tsx`

**1. Fix pickup_drops query** (line 249):
- Change `.order("stop_order", { ascending: true })` to `.order("sequence_number", { ascending: true })`

**2. Add sort state**:
```typescript
const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' });
```

**3. Add "next orders" query**:
After building `sortedCities`, collect all `orderIds` from all cities. Fetch those orders to get driver1_id and pickup_datetime. Then fetch ALL orders for those drivers (not canceled, with pickup_datetime), and for each heatmap order find the next one in memory. Build a map: `cityKey -> { freight, miles, count }`.

**4. Update table rendering**:
- Use next-order financials for Avg Freight, Avg Miles, RPM columns
- Make City, Total, RPM headers clickable with sort indicators (chevron up/down)
- Apply sort in the `sortedCities` memo using `sortConfig`

**5. Update CityAgg interface** to carry computed next-order financials:
```typescript
interface CityAgg {
  city: string;
  total: number;
  totalFreight: number;   // kept for backward compat
  totalMiles: number;     // kept for backward compat
  daysWithData: number;
  orderIds: string[];
  // Next-order financials (computed separately)
  nextFreight?: number;
  nextMiles?: number;
  nextCount?: number;
}
```

### Performance Consideration

For the "next order" lookup, instead of querying per-driver, we:
1. Fetch all heatmap orders (get driver IDs and pickup dates)
2. Fetch all non-canceled orders for those drivers in a single batched query
3. Sort in-memory and find "next" for each heatmap order

This keeps it to ~3-4 Supabase queries total regardless of data volume.

## Summary

| Change | Location | What |
|---|---|---|
| Fix lane query | `BeverlyHeatmap.tsx` line 249 | `stop_order` -> `sequence_number` |
| Next-order financials | `BeverlyHeatmap.tsx` new query | Fetch next order per driver for Avg/RPM |
| Sortable columns | `BeverlyHeatmap.tsx` | Click City/Total/RPM headers to sort |

