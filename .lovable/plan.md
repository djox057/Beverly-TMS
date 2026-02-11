

## Implement Metrics 1 and 2 + DB Migration for Metric 3

### Part 1: Average DH Miles per Order (Metric 1)

**Data source:** `order.dhMiles` (mapped from `dh_miles`) is already available in `filteredOrders`. No new queries needed.

**Changes to `src/pages/Analytics.tsx`:**

1. **Accumulator** (line ~1176-1196): Add `totalDhMiles: 0` to the initial accumulator shape, and `acc[dispatcher].totalDhMiles += Number(order.dhMiles) || 0` in the reduce body.

2. **Stat computation** (line ~1197-1229): Add `avgDhMiles: stats.orderCount > 0 ? stats.totalDhMiles / stats.orderCount : 0` to the returned object. Also update the type annotations to include `totalDhMiles: number`.

3. **Sort state** (line ~160): Extend the `sortBy` union type to include `"avgDhMiles"`.

4. **handleSort** (line ~1688): Extend the column union type to include `"avgDhMiles"`.

5. **Table header** (line ~2243, after Rate/Mile column): Add a new sortable column header:
```
{!isDispatchOnly && <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("avgDhMiles")}>
  Avg DH {sortBy === "avgDhMiles" && (sortDirection === "desc" ? "..." : "...")}
</TableHead>}
```

6. **Table cell** (line ~2281, after Rate/Mile cell): Add:
```
{!isDispatchOnly && <TableCell className="text-right">{stat.avgDhMiles.toFixed(0)}</TableCell>}
```

### Part 2: Average Weekly Gross per Driver (Metric 2)

**Data source:** `stat.totalFreight`, `stat.avgTrucks`, and `daysInPeriod` are all already computed. No new queries needed.

**Changes to `src/pages/Analytics.tsx`:**

1. **Stat computation** (line ~1197-1229): Compute `avgWeeklyGrossPerDriver` using the same `daysInPeriod` from `fleetAverages`:
```typescript
const daysInPeriod = dateRange?.from
  ? Math.ceil(((dateRange.to || dateRange.from).getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
  : 1;
const weeksInPeriod = Math.max(1, daysInPeriod / 7);
const avgWeeklyGrossPerDriver = avgTrucks > 0
  ? stats.totalFreight / avgTrucks / weeksInPeriod
  : 0;
```
Note: Uses `Math.max(1, daysInPeriod / 7)` uniformly -- no branching on period length.

2. **Sort state** (line ~160): Extend sort union to include `"avgWeeklyGrossPerDriver"`.

3. **handleSort** (line ~1688): Extend column union.

4. **Table header** (after Avg Trucks column, line ~2252): Add:
```
{!isDispatchOnly && <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("avgWeeklyGrossPerDriver")}>
  Avg Wk Gross/Dr {sortBy === "avgWeeklyGrossPerDriver" && ...}
</TableHead>}
```

5. **Table cell** (after Avg Trucks cell, line ~2292): Add:
```
{!isDispatchOnly && <TableCell className="text-right">
  ${stat.avgWeeklyGrossPerDriver.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
</TableCell>}
```

Since `daysInPeriod` is currently computed inside the `fleetAverages` useMemo (line ~1338), and `dispatcherStats` is computed outside it, the `daysInPeriod` calculation will be extracted to a standalone variable above both computations so it can be shared.

### Part 3: DB Migration for Metric 3 (ship independently)

**Database migration** -- adds `last_dispatcher_id` column and a trigger with the precise condition:

```sql
-- Add last_dispatcher_id to drivers
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS last_dispatcher_id uuid;

-- Trigger function: only fires when dispatcher_id goes from non-null to null
CREATE OR REPLACE FUNCTION public.preserve_last_dispatcher_id()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.dispatcher_id IS NOT NULL AND NEW.dispatcher_id IS NULL THEN
    NEW.last_dispatcher_id := OLD.dispatcher_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trigger_preserve_last_dispatcher ON public.drivers;
CREATE TRIGGER trigger_preserve_last_dispatcher
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_last_dispatcher_id();
```

The trigger condition is precise: it only fires when `OLD.dispatcher_id IS NOT NULL AND NEW.dispatcher_id IS NULL`, so normal reassignments between dispatchers will not overwrite `last_dispatcher_id`.

No UI changes for metric 3 in this implementation -- the query and "Done" column will be added after resolving the three open questions (termination vs. reassignment disambiguation, date range behavior).

### Summary

| Change | File | Type |
|--------|------|------|
| Add `totalDhMiles` accumulator + `avgDhMiles` stat | `src/pages/Analytics.tsx` | Code |
| Add `avgWeeklyGrossPerDriver` stat | `src/pages/Analytics.tsx` | Code |
| Extract `daysInPeriod` to shared scope | `src/pages/Analytics.tsx` | Code |
| Add 2 new table columns (hidden from dispatch role) | `src/pages/Analytics.tsx` | Code |
| Extend sort state + handleSort for new columns | `src/pages/Analytics.tsx` | Code |
| Add `last_dispatcher_id` column + trigger | DB migration | SQL |

