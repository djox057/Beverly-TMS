

# Beverly Heatmap - Implementation Plan

## Overview

Create a "Beverly Heatmap" page that shows truck density near US cities using a data-driven clustering algorithm. A scheduled edge function discovers hotspots from actual stop data every Sunday at 3 AM Chicago time.

## Implementation Order

### Step 1: Database Migration

Create two tables with RLS:

**`heatmap_reference_cities`** -- ~300 US cities (population >100k) used as snap targets for clusters.

- Columns: `id`, `city_name`, `state`, `latitude`, `longitude`, `population`
- Unique constraint on `(city_name, state)`
- RLS: SELECT for authenticated, ALL for admin/manager

**`heatmap_city_counts`** -- Pre-computed daily truck counts per city.

- Columns: `id`, `city_name`, `city_state`, `city_lat`, `city_lng`, `count_date`, `truck_count`, `created_at`
- Unique constraint on `(city_name, city_state, count_date)`
- Index on `count_date DESC`
- RLS: SELECT for authenticated, ALL for admin/manager

### Step 2: Seed Reference Cities

Insert ~300 US cities with population over 100k into `heatmap_reference_cities` via batched INSERT statements using the insert tool.

### Step 3: Edge Function (`compute-heatmap`)

**File:** `supabase/functions/compute-heatmap/index.ts`

**Dual authentication:**
- Cron path: validates `Authorization: Bearer <CRON_SECRET>` against the existing `CRON_SECRET` secret. Uses service role client for DB writes.
- Manual path: validates the user's JWT via `supabase.auth.getUser()`, then checks they have admin or manager role via a query to `user_roles`. Uses service role client for DB writes.

**Algorithm (per day):**

1. Fetch stops from `pickup_drops` joined with `orders` for the target date (where coordinates exist, order not canceled, truck assigned)
2. Grid-based density scan: assign stops to 0.5-degree cells, count distinct trucks per cell
3. Greedy non-overlapping selection:
   - Sort cells by truck count descending
   - Compute weighted centroid of actual stops in the winning cell
   - Bounding box pre-filter (plus/minus 1 degree) then Haversine to find stops within 60 miles
   - Mark those stops as consumed, recalculate remaining cell counts
   - Repeat until truck count < 3
4. Snap to nearest major city (highest population within 60 miles from `heatmap_reference_cities`)
   - Deduplication: if two clusters snap to the same city, merge truck ID sets (union)
   - Drop clusters with no city within 60 miles
5. Upsert results into `heatmap_city_counts`

**Invocation modes:**
- No params (cron): process last 14 days sequentially
- `?date=YYYY-MM-DD`: single day
- `?from=YYYY-MM-DD&to=YYYY-MM-DD`: date range

**Config:** Add `verify_jwt = false` to `supabase/config.toml`.

### Step 4: Frontend Page (`src/pages/BeverlyHeatmap.tsx`)

- Date range picker (default: last 14 days)
- View toggle: Daily / Weekly / Monthly aggregation
- Table grid: rows = cities (sorted by total truck count desc), columns = dates
- Color-coded cells (gray/blue/yellow/red gradient)
- Manual recompute button for admin/manager (calls edge function with user's auth token)
- Data fetched from `heatmap_city_counts` via Supabase client
- Client-side aggregation for weekly/monthly with note about potential same-truck counting

### Step 5: Navigation and Routing

**Sidebar (`src/components/Sidebar.tsx`):**
- Add "Beverly Heatmap" below Analytics with `MapPin` icon
- Restricted to `manager`, `admin`, `chicago_management` roles

**App.tsx:**
- Add `/beverly-heatmap` route with `allowedRoles={['manager', 'admin', 'chicago_management']}`

### Step 6: Cron Job

Schedule via `pg_cron` + `pg_net` (INSERT tool):
- Sunday 9 AM UTC (3 AM CST / 4 AM CDT)
- Passes `CRON_SECRET` in Authorization header
- Documented DST shift

## Files Changed

| File | Action |
|------|--------|
| Migration SQL | Create `heatmap_reference_cities` and `heatmap_city_counts` tables |
| INSERT SQL (batched) | Seed ~300 US cities |
| INSERT SQL | Create `pg_cron` schedule |
| `supabase/functions/compute-heatmap/index.ts` | New edge function |
| `supabase/config.toml` | Add `verify_jwt = false` for compute-heatmap |
| `src/pages/BeverlyHeatmap.tsx` | New heatmap page |
| `src/components/Sidebar.tsx` | Add nav item |
| `src/App.tsx` | Add route, import page |

## Technical Notes

- The edge function uses `SUPABASE_SERVICE_ROLE_KEY` for all DB operations (bypasses RLS)
- Haversine helper uses Earth radius of 3959 miles
- Grid cell size of 0.5 degrees is roughly 35 miles wide at mid-latitudes
- Minimum cluster threshold: 3 trucks
- Weekly/monthly aggregation is client-side sum with a disclaimer about potential double-counting

