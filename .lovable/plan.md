## Goal

Add a third mode to the Lane tab (alongside the current single-lane search and TRI-HAUL) called **DEEP SEARCH**. It finds (broker × lane) pairs we've run repeatedly so you can target contract pricing, and it shows whether the rate on that lane is trending up or down with an expected next-period rate.

## UI changes — `src/pages/BeverlyHeatmapLane.tsx`

1. Add a third toggle button next to TRI-HAUL: **DEEP SEARCH** (icon: `Repeat` or `TrendingUp`). The three modes are mutually exclusive.
2. When DEEP SEARCH is active, show:
   - A **Scope** toggle: `All lanes (global)` ↔ `Filter by entered pickup/delivery` (uses the same pickup/delivery inputs but as exact-lane filter, not radius).
   - The minimum-repeats slider is fixed at **3** (no UI control needed; mention in helper text).
   - Pickup/Delivery radius inputs are hidden — exact matching uses a fixed 1 mile tolerance on both ends.
3. Results table columns:
   - Pickup (city, ST) → Delivery (city, ST)
   - Broker (name + MC)
   - Loads (count in window)
   - Avg Rate, Avg Miles, Avg RPM (overall in window)
   - Last 30d Avg RPM
   - Prior 30d Avg RPM
   - Trend (↑ / ↓ / →, % change, colored: green up / red down / muted flat)
   - Expected next rate (projected $/load = last-30 avg RPM × avg miles, plus projected RPM)
   - Row click → existing-style dialog listing the individual loads (load #, stops, $ , miles).
4. Sortable columns (loads, avg RPM, trend %, expected). Default sort: loads desc.
5. Empty/loading states matching existing patterns.

## Backend — new edge function `supabase/functions/lane-deep-search/index.ts`

Request body:
```ts
{
  scope: "global" | "filtered",
  pickup?: { lat, lng } | null,   // required when scope === "filtered" (at least one of pickup/delivery)
  delivery?: { lat, lng } | null,
  dateFrom?: string | null,        // overall window used for the table
  dateTo?: string | null,
  minRepeats?: number              // default 3
}
```

Auth: same pattern as `lane-search` (Bearer token, any role in `user_roles`).

Algorithm:
1. Pull all non-canceled orders in the date range that have a `broker_id`, joined with their `pickup_drops` (need first pickup + last delivery lat/lng/city/state). Paginate / chunk `.in()` at 200 like other functions.
2. For each order build a lane key by snapping the first pickup and last delivery to a ~1-mile grid: `round(lat * 69)` & `round(lng * 69 * cos(lat))` → integer cell on each end. This is the "<1 mile radius" exact match.
3. Group by `(broker_id, pickupCell, deliveryCell)`. Keep groups with `count >= minRepeats`.
4. For each group compute:
   - `avg_freight`, `avg_miles`, `avg_rpm` over window
   - `last30_rpm` (orders with pickup in last 30 days of window), `prior30_rpm` (the 30 days before that)
   - `trend_pct = (last30_rpm - prior30_rpm) / prior30_rpm` when both > 0
   - `expected_rate = last30_rpm * avg_miles` (fallback to overall avg_rpm when last30 missing)
   - Representative pickup/delivery city+state (mode of stops in the group)
   - `order_ids` for the dialog
5. If `scope === "filtered"`, before grouping discard orders whose first pickup is >1 mi from the provided pickup coord (if given) and/or last delivery >1 mi from delivery coord.
6. Return `{ lanes: [...] }` sorted by count desc, capped at e.g. 500.

Performance: same cost-aware approach as `lane-search` — bbox prefilter on pickup_drops when scope is filtered; for global, paginate orders by date range (this is the heavy path — document the cost and cap to e.g. 5000 orders before grouping, surfacing a warning in the response if truncated).

## Frontend wiring

- New `useQuery` keyed on `["heatmap-lane-deep", scope, pickupCoords, deliveryCoords, startDateStr, endDateStr]` calling `supabase.functions.invoke("lane-deep-search", { body })`, enabled only when `deepMode === true` and (scope === "global" || hasCoords).
- Reuse the existing dialog component — feed it `order_ids` from the clicked row.

## Out of scope

- No DB migrations or new tables (computed live, matches existing Lane patterns).
- No changes to `lane-search` or `lane-trihaul`.
- No new memory entry needed unless behavior turns out to be sensitive — can add post-implementation if useful.
