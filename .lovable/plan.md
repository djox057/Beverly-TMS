

## Fix: Avg Wk Gross/Dr inflated weeks for current/future months

### Problem
When selecting a month that includes today (e.g., February while it's Feb 12), `daysInPeriod` uses the full calendar range (28 days for Feb), producing `weeksInPeriod = 4`. But only ~12 days of data exist, so dividing by 4 weeks instead of ~1.7 makes the metric artificially low.

### Root Cause
`daysInPeriod` on line 1233-1234 calculates:
```
Math.ceil((dateRange.to - dateRange.from) / oneDay) + 1
```
When "February" is selected, `dateRange.to` is Feb 28, even though today is Feb 12. The freight data only covers Feb 1-12, but it gets divided over 4 full weeks.

### Fix
Cap `dateRange.to` at today's date when calculating `daysInPeriod`. This way, if the selected range extends into the future, only elapsed days are counted.

### Technical Changes

**File: `src/pages/Analytics.tsx`**

**Line 1233-1235** -- Cap the end date at today:
```typescript
const today = new Date();
const effectiveTo = dateRange?.to ? (dateRange.to > today ? today : dateRange.to) : (dateRange?.from || today);
const daysInPeriod = dateRange?.from
  ? Math.ceil((effectiveTo.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
  : 1;
```

**Line 2285** -- Same fix for the dispatch-role section:
```typescript
const today = new Date();
const effectiveTo = dateRange?.to ? (dateRange.to > today ? today : dateRange.to) : (dateRange?.from || today);
const daysInPeriod = dateRange?.from
  ? Math.ceil((effectiveTo.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
  : 1;
```

This ensures that for February (while it's Feb 12), `daysInPeriod = 12` and `weeksInPeriod = 12/7 = 1.71`, giving the correct weekly average. For fully past months, the cap has no effect since `dateRange.to` is already before today.
