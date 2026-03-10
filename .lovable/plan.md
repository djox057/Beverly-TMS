

## Plan: Split Beverly Heatmap into Two Tabs

### Overview
Add tabs to the Beverly Heatmap page. **Tab 1** ("Heatmap") keeps the existing city truck density view unchanged. **Tab 2** ("Facilities") shows a searchable table of frequently visited facilities using the grid-based clustering query on `pickup_drops`.

### Changes

**1. Create a new DB function for the facility query**
- Create a Supabase migration with a `get_facility_visit_counts()` function that runs the grid-based clustering SQL (the query provided). This avoids timeout issues by running server-side and allows calling via `supabase.rpc()`.

**2. Create `src/pages/BeverlyHeatmapFacilities.tsx`**
- New component that:
  - Calls `supabase.rpc('get_facility_visit_counts')` via `useQuery`
  - Renders a searchable/sortable table with columns: Company Name, Address, City, State, Zip, Pickups, Deliveries, Total
  - Includes a text search input to filter by company name or city
  - Sortable by pickup_count, delivery_count, total_visits

**3. Update `src/pages/BeverlyHeatmap.tsx`**
- Wrap the existing content and the new Facilities component in `<Tabs>` with two `<TabsTrigger>` items: "Heatmap" and "Facilities"
- Tab 1 content = everything currently rendered (unchanged)
- Tab 2 content = `<BeverlyHeatmapFacilities />`
- All existing state/logic remains untouched

### Technical Details

**DB function SQL:**
```sql
CREATE OR REPLACE FUNCTION get_facility_visit_counts()
RETURNS TABLE(
  address text, city text, state text, zip_code text,
  company_name text, pickup_count bigint,
  delivery_count bigint, total_visits bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH gridded AS (
    SELECT pd.*,
      ROUND(latitude::numeric * 10, 1) AS lat_cell,
      ROUND(longitude::numeric * 10, 1) AS lng_cell
    FROM pickup_drops pd
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  )
  SELECT
    MODE() WITHIN GROUP (ORDER BY g.address) AS address,
    MODE() WITHIN GROUP (ORDER BY g.city) AS city,
    MODE() WITHIN GROUP (ORDER BY g.state) AS state,
    MODE() WITHIN GROUP (ORDER BY g.zip_code) AS zip_code,
    MODE() WITHIN GROUP (ORDER BY g.company_name) AS company_name,
    COUNT(*) FILTER (WHERE g.type = 'pickup') AS pickup_count,
    COUNT(*) FILTER (WHERE g.type = 'delivery') AS delivery_count,
    COUNT(*) AS total_visits
  FROM gridded g
  GROUP BY g.lat_cell, g.lng_cell
  HAVING COUNT(*) >= 2
  ORDER BY total_visits DESC
  LIMIT 500;
$$;
```

**File structure:**
- `src/pages/BeverlyHeatmapFacilities.tsx` — facilities table component
- `src/pages/BeverlyHeatmap.tsx` — add Tabs wrapper around existing content + new tab

