

## Heatmap Enhancements: YARD Rename + Financial Metrics

### Database Changes

**Migration (schema):**
```sql
ALTER TABLE heatmap_city_counts
  ADD COLUMN IF NOT EXISTS total_freight numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_miles numeric DEFAULT 0;
```

**Data updates (insert tool):**
- Rename Chicago to YARD in `heatmap_reference_cities` with new coordinates (41.53803937985626, -87.57862703756386)
- Rename Chicago to YARD in all existing `heatmap_city_counts` rows with updated lat/lng

### Edge Function: `supabase/functions/compute-heatmap/index.ts`

1. **Expand Stop interface** to include `order_id`:
```text
interface Stop {
  truck_id: string;
  order_id: string;
  latitude: number;
  longitude: number;
}
```

2. **Expand orders query** to also fetch `freight_amount`, `loaded_miles`, `dh_miles`, `mileage` alongside `id, truck_id`.

3. **Build an order financials map** keyed by order_id:
   - `miles = mileage ?? (loaded_miles + dh_miles) ?? 0` (null-safe, consistent priority)
   - `freight = freight_amount ?? 0`

4. **Track order attribution during clustering**: maintain a global `attributedOrders` Set. During the greedy clustering loop, alongside `cityTrucks`, also build `cityOrders` (Set of order_ids). When a stop is consumed into a city cluster:
   - Always add its truck_id to `cityTrucks`
   - Only add the order_id to `cityOrders` if it is NOT already in `attributedOrders` -- this ensures each order's freight/miles count in exactly one city (the first pickup city that claims it)
   - After processing a cluster, add all newly attributed order_ids to the global set

5. **Compute financial totals per city**: after clustering, for each city sum `freight` and `miles` from its `cityOrders` using the financials map.

6. **Upsert** with `total_freight` and `total_miles` included in each row.

### Frontend: `src/pages/BeverlyHeatmap.tsx`

1. **Update HeatmapRow interface**: add `total_freight: number` and `total_miles: number`.

2. **Update query select** to fetch the new columns.

3. **Update aggregation useMemo**: alongside truck_count, also sum `total_freight` and `total_miles` per city per bucket. Compute RPM on the fly as `total_freight / total_miles` (handles division by zero gracefully).

4. **Add columns to the table**: show Total Freight, Total Miles, and RPM (computed) per city row, aggregated across the selected date range.

### Files Changed
- `supabase/functions/compute-heatmap/index.ts` -- order attribution logic, financial aggregation
- `src/pages/BeverlyHeatmap.tsx` -- new columns, RPM computed client-side
- Database migration (2 new columns) + data updates (Chicago to YARD rename)

### Post-Deploy
Click **Recompute** to populate historical data with financial metrics.

