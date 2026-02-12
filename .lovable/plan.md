

## Fix: Simplify Avg Wk Gross/Dr Formula Based on Filter Type

The current formula always divides by `weeksInPeriod` (daysInPeriod / 7), which produces incorrect results. The new logic is simpler and filter-aware.

### New Formula

- **Weekly filter** (selectedWeek is a specific week, or "All time weekly"): just `totalFreight / avgTrucks` -- no time division needed since the period IS one week
- **Monthly or Custom filter**: `totalFreight / avgTrucks / daysInPeriod * 7` -- normalize to a weekly rate

### Changes in `src/pages/Analytics.tsx`

**Location 1: Dispatcher stats calculation (~lines 1283-1287)**

Replace the current weeksInPeriod logic with filter-type-aware logic:

```typescript
// Avg Wk Gross/Dr: for weekly filter, just divide by trucks.
// For monthly/custom, normalize to weekly rate.
const avgWeeklyGrossPerDriver = avgTrucks > 0
  ? filterType === "week"
    ? stats.totalFreight / avgTrucks
    : stats.totalFreight / avgTrucks / daysInPeriod * 7
  : 0;
```

Remove the now-unused `weeksInPeriod` variable at line 1284.

**Location 2: Dispatch-only fleet summary section (~lines 2289-2300)**

Apply the same filter-type-aware logic for `displayWeeklyAvgGross` and `displayWeeklyAvgMiles`:

```typescript
const displayWeeklyAvgGross = displayTruckCount > 0
  ? filterType === "week"
    ? displayFreight / displayTruckCount
    : displayFreight / displayTruckCount / daysInPeriod * 7
  : 0;
const displayWeeklyAvgMiles = displayTruckCount > 0
  ? filterType === "week"
    ? displayMiles / displayTruckCount
    : displayMiles / displayTruckCount / daysInPeriod * 7
  : 0;
```

Remove the unused `weeksInPeriod` variable at line 2290.

### Expected Results

For David Mijailovic-Dom with "Last Week" (weekly filter):
- $28,900 / 3.0 = **$9,633** (correct)

For a monthly view (e.g., 30 days):
- $28,900 / 3.0 / 30 * 7 = **$2,248** (weekly rate derived from monthly data)
