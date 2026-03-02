

# Fix 1: Analytics -- Select Only Needed Columns

## Problem
Line 518 in `Analytics.tsx` uses `.select("*")` on `dispatcher_daily_driver_counts`, pulling every column. This query runs 108,645 times and accounts for **81.6% of total database CPU**. The selective version (fetching just 2 columns) only takes 3.6ms vs 145ms -- a 40x difference.

## Change
**File:** `src/pages/Analytics.tsx`, line 518

**Before:**
```typescript
.select("*")
```

**After:**
```typescript
.select("dispatcher_id, driver_count, truck_count, date")
```

Only these 4 fields are used by the code:
- `dispatcher_id` -- grouping key
- `driver_count` -- summed per dispatcher
- `truck_count` -- summed per dispatcher (with fallback to driver_count)
- `date` -- used in the `.gte()` / `.lte()` filters (still needed in response for counting `daysCount`)

## Expected Impact
- Query time drops from ~145ms to ~3.6ms per call (40x faster)
- Total DB CPU usage reduced by approximately 80%
- No functional change -- all consumed fields are still selected

