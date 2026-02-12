
## Issue: Avg Wk Gross/Dr Calculation Is Incorrect

### Current Behavior
For "Andrej Sretenovic-Alex" with a 7-day week showing $63,545.00 total freight, the display shows $7,943 instead of the expected $9,077 ($63,545 ÷ 7).

### Root Cause Analysis
The calculation in `src/pages/Analytics.tsx` (lines 1281-1284) is:
```typescript
const weeksInPeriod = Math.max(1, daysInPeriod / 7);
const avgWeeklyGrossPerDriver = avgTrucks > 0
  ? stats.totalFreight / avgTrucks / weeksInPeriod
  : 0;
```

**The Problem:**
- The formula divides by **both** `avgTrucks` **and** `weeksInPeriod`
- Your correct formula should be: `totalFreight / avgDrivers / weeksInPeriod`
- Currently it's doing: `totalFreight / avgTrucks / weeksInPeriod` where `avgTrucks` may not equal the average number of drivers

**Specific Issue for Last Week:**
- If the week is 7 days: `weeksInPeriod = 7 ÷ 7 = 1` ✓ (correct)
- But `avgTrucks` is being calculated from `dispatcherTruckData.totalTrucks / dispatcherTruckData.daysCount`
- This averages the **truck count** across recorded days, not the actual average drivers in that period
- The extra division by `avgTrucks` (which should be ~7 based on your expected result) is causing the $9,077 to become $7,943

**The Fix:**
The metric should represent "gross freight per driver per week". Currently it's calculating "gross freight per truck per week", then dividing by average trucks again, which double-counts the truck averaging.

The correct formula should be:
```typescript
const avgWeeklyGrossPerDriver = weeksInPeriod > 0
  ? stats.totalFreight / weeksInPeriod
  : 0;
```

This gives you: `$63,545 / 1 week = $63,545 per week`

OR if you want "per driver":
```typescript
const avgDriverCount = truckCountData && truckCountData.daysCount > 0 
  ? truckCountData.totalTrucks / truckCountData.daysCount 
  : 0;
const avgWeeklyGrossPerDriver = (avgDriverCount > 0 && weeksInPeriod > 0)
  ? stats.totalFreight / avgDriverCount / weeksInPeriod
  : 0;
```

But this would give `$63,545 / (avg drivers) / 1 week`. For your example to result in $9,077, the average drivers would need to be ~7.

### Solution
I need to clarify with you: **What does "Avg Wk Gross/Dr" actually mean?**

1. **Gross freight per driver per week** = `totalFreight / avgDriverCount / weeksInPeriod`
   - Example: $63,545 / 7 drivers / 1 week = $9,077 per driver per week

2. **Gross freight per week (total fleet)** = `totalFreight / weeksInPeriod`
   - Example: $63,545 / 1 week = $63,545 per week for the fleet

The column heading and calculation currently suggest it should be option 1, which means the issue is that `avgTrucks` is not correctly representing the average number of drivers assigned to this dispatcher during that period.

