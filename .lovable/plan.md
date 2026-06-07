## Scope

Update the Home Time tab on `/daily-report` (`src/components/dailyReport/HomeTimeTable.tsx`).

## Changes

1. **Date filter** — Add a filter control next to the existing heading with four options:
   - **All time** (default — current behavior)
   - **Weekly** — rows from the last 7 days (Chicago time)
   - **Monthly** — rows from the last 30 days (Chicago time)
   - **Custom** — opens a date range picker (shadcn Calendar in a Popover) for `from`/`to`

   The filter is applied to each driver's Home rows by `r.date`. A driver only appears in the list if they have ≥1 Home row in the selected range. The row count shown next to the driver also reflects the filtered set.

2. **Sort drivers by number of rows** — Replace the alphabetical `localeCompare` sort with a descending sort by the number of (filtered) Home rows. Ties break by driver name ascending so order is stable.

3. The existing global search bar (`truckFilter` prop) keeps working; it filters after the date filter.

## Out of scope

- No DB / RPC changes.
- No changes to other Daily Report tabs.
- No changes to row coloring, columns, or expand/collapse behavior.
