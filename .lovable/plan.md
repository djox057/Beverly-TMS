

## Fix: Avg Wk Gross/Dr Should Divide by Avg Trucks, Not Avg Drivers

### Problem
For "David Mijailovic-Dom" last week: $28,900 total freight, 3.0 avg trucks, but displayed Avg Wk Gross/Dr = $8,429 instead of expected $9,633.

### Root Cause
The formula on line 1285-1286 divides by `avgDrivers` (derived from `driver_count` snapshots), which counts individual drivers including team drivers (driver2). A truck with a team counts as 1 truck but 2 drivers.

- `avgTrucks` = 3.0 (what the user expects to divide by)
- `avgDrivers` = ~3.43 (includes team driver seats)
- $28,900 / 3.43 / 1 = $8,429 (current, wrong)
- $28,900 / 3.0 / 1 = $9,633 (expected, correct)

### Fix
Change the divisor from `avgDrivers` to `avgTrucks` in the Avg Wk Gross/Dr calculation.

**File: `src/pages/Analytics.tsx`**

Line 1285-1286 -- change `avgDrivers` to `avgTrucks`:
```typescript
const avgWeeklyGrossPerDriver = avgTrucks > 0
  ? stats.totalFreight / avgTrucks / weeksInPeriod
  : 0;
```

Line ~2285 (dispatch-role section) -- apply the same fix if present.

This is a one-line change that aligns the metric with the displayed "Avg Trucks" column value, ensuring the math is transparent and verifiable from the table.
