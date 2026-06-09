# Cities heatmap → fixed reference markets only

Replace the current "all cities" cities view with a fixed list of ~250 reference markets (from `us_reference_markets.md`). Each market aggregates every pickup/delivery within a 60-mile radius and gets the same 1–10 composite rating used elsewhere. The heatmap surface and tooltip are driven only by these markets.

## 1. Seed reference markets table

Reuse the existing `heatmap_reference_cities` table (already has `city_name, state, latitude, longitude`). Replace its contents with the markdown's list (lower-48 only, AK/HI excluded as the file specifies).

- New migration: `DELETE FROM heatmap_reference_cities;` then `INSERT` ~250 rows with geocoded lat/lng for each market (hardcoded constants in the migration — single source of truth).
- Combo entries like `Dallas / Fort Worth`, `San Francisco / Oakland`, `Raleigh / Durham`, `Seattle / Tacoma`, `Northern Virginia`, `Gary / Northwest Indiana`, `Scranton / Wilkes-Barre`, `Tri-Cities`, `Rockville / Gaithersburg`, `Lowell / Lawrence`, `Greenville / Spartanburg`, `Minneapolis / St. Paul` → store as one row with a representative centroid.
- Note: the table is also used by the older `compute-heatmap` edge function. Switching it to the reference-market list is fine — that function snaps clusters to nearest city in the same table; with the curated list it will simply snap to the curated markets, which is the desired behavior project-wide.

## 2. New RPC: `get_us_map_market_stats`

```sql
get_us_map_market_stats(p_direction text, p_from timestamptz, p_radius_miles numeric default 60)
returns table(
  market text, state text, latitude numeric, longitude numeric,
  count bigint, freight numeric, loaded_miles numeric, dh_miles numeric
)
```

Logic (single SQL, all server-side):

1. `chosen` CTE = same as `get_us_map_city_stats` — one pickup or delivery row per order based on `p_direction`, filtering canceled/null and `pickup_datetime >= p_from`.
2. Cross-join `chosen` with `heatmap_reference_cities`, keep pairs where Haversine distance ≤ `p_radius_miles`.
3. For each `chosen` row, pick the **nearest** market (`DISTINCT ON (order_id) ... ORDER BY order_id, distance`). This guarantees each order is counted once even if it falls inside two market circles.
4. Group by market, aggregate `count`, `sum(freight_amount)`, `sum(loaded_miles)`, `sum(dh_miles)` joined back to `orders`.
5. Return all markets that have ≥1 matched order (return zero-count markets too? → No, return only matched; frontend already only colors where data exists).

Performance: ~250 markets × few thousand stops with a tight `abs(lat-lat)<1 AND abs(lng-lng)<1` prefilter before Haversine. Runs in <500ms typical.

## 3. Frontend changes (`src/pages/BeverlyHeatmapUsMap.tsx`)

- Replace the `useCityRatings` hook to call the new RPC `get_us_map_market_stats` instead of `get_us_map_city_stats`.
- Keep the same composite rating function (Count, RPM, DH/load, Avg Gross → 1–10) — applied to markets now.
- Keep the deck.gl `HeatmapLayer` overlay with `weight = rating * log(count + 1)`, but:
  - Tighten `radiusPixels` (e.g. 45) since markets are sparser than raw cities — gives the topographic "circle per market" look that blends into corridors (Dallas–Houston, etc.).
- Tooltip: nearest market within ~80 px, showing `market, state, rating, count, freight, RPM`.
- Legend label: change "Cities" → "Markets" in the toggle and tooltip header.

## 4. Files

- New migration: seed `heatmap_reference_cities` with the reference market list.
- New migration: create `get_us_map_market_stats` RPC + `GRANT EXECUTE ... TO authenticated, service_role`.
- `src/pages/BeverlyHeatmapUsMap.tsx` — swap the RPC name in the cities/markets fetch hook, rename label.

No new tables, no edge functions, no new deps.
