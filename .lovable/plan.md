
# Fix Analytics Avg Trucks/Drivers Calculation

## Problem
The "Avg # Trucks" metric shows incorrect values (e.g., 2.8 instead of 7.0) for incomplete periods. This happens because the calculation divides by the **total days in the date range** instead of the **actual days with recorded data**.

### Root Cause
The daily driver count snapshot runs at 8 PM. When viewing a current month or week:
- The date range includes today, but today's snapshot hasn't run yet
- Missing days are treated as "0 trucks" in the average
- Example: Feb 1-3 range has 3 days, but only Feb 1-2 have data
  - Current: `(7+7+0) / 3 = 4.67` or worse with larger ranges
  - Expected: `(7+7) / 2 = 7.0`

## Solution
Change the averaging formula to use `daysCount` (actual recorded days) instead of `totalDaysInRange`.

### Code Changes

**File: `src/pages/Analytics.tsx`**

1. **Line 1134** - Update the averaging calculation:

   Current:
   ```typescript
   const avgTrucks = truckCountData && truckCountData.totalDaysInRange > 0 
     ? truckCountData.totalTrucks / truckCountData.totalDaysInRange 
     : 0;
   ```

   Change to:
   ```typescript
   const avgTrucks = truckCountData && truckCountData.daysCount > 0 
     ? truckCountData.totalTrucks / truckCountData.daysCount 
     : 0;
   ```

2. **Similar change for avgDrivers** (if present) - Apply the same fix using `daysCount`.

3. **Clean up unused variables** - The `totalDaysInRange` calculation (lines 418-428) can be simplified or removed since it's no longer used for the average.

## Technical Details

The `dispatcherTruckCounts` state already tracks both values:
- `totalTrucks`: Sum of all truck counts for the dispatcher
- `daysCount`: Number of days with actual recorded data
- `totalDaysInRange`: Number of calendar days in the selected range (currently used but incorrect)

After this fix:
- A dispatcher with 7 trucks on Feb 1 and Feb 2 will show **7.0 avg trucks**
- The average reflects actual fleet size, not diluted by future/missing days
- Works correctly for both complete months and in-progress periods

## Impact
- Analytics page: "Avg # Trucks" and "Avg # Drivers" columns
- Fleet metrics in header (uses same data source)
