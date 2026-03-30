

# Add Sorting for Miles, Total Loads, and Avg Trucks in Analytics

## What's Happening Now
The dispatcher table in Analytics supports sorting by clicking column headers for Total Freight, Rate/Mile, Avg DH, Comm., Comm. %, Avg Wk Gross/Dr, Turnover, and Empty Days. However, **Total Miles**, **Total Loads**, and **Avg Trucks** columns are plain headers with no click-to-sort behavior.

## Changes

### File: `src/pages/Analytics.tsx`

1. **Expand the `sortBy` type** (line ~162): Add `"totalMiles" | "orderCount" | "avgTrucks"` to the union type.

2. **Update `handleSort`** (line ~2059): Add the three new column names to the function's parameter type.

3. **Update sort logic** (line ~1586): The existing `a[sortBy]` / `b[sortBy]` dynamic access should already work since these field names match the dispatcher stats object keys (`totalMiles`, `orderCount`, `avgTrucks`).

4. **Make table headers clickable** (lines ~2774, 2788, 2792):
   - **Total Miles** (line 2774): Add `cursor-pointer hover:bg-muted/50`, `onClick={() => handleSort("totalMiles")}`, and sort indicator arrow.
   - **Avg Trucks** (line 2788): Same treatment with `handleSort("avgTrucks")`.
   - **Total Loads** (line 2792): Same treatment with `handleSort("orderCount")`.

