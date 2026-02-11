

## Add "Turnover" Column to Dispatcher Performance Table

### What it shows
For each dispatcher, the count of drivers whose `last_dispatcher_id` matches that dispatcher and whose `termination_date` falls within the currently selected date range. This uses the `last_dispatcher_id` column and trigger already in place.

### Implementation

**1. New query -- fetch terminated drivers grouped by dispatcher (src/pages/Analytics.tsx)**

Add a `useQuery` hook that fetches from the `drivers` table:
```
SELECT last_dispatcher_id, COUNT(*) 
FROM drivers 
WHERE is_active = false 
  AND last_dispatcher_id IS NOT NULL 
  AND termination_date >= dateRange.from 
  AND termination_date <= dateRange.to
GROUP BY last_dispatcher_id
```

This will be implemented as a Supabase client query, filtering by `termination_date` range and grouping in JS (since Supabase JS client doesn't support GROUP BY directly). The query key will include the date range so it re-fetches when the range changes.

**2. Build a lookup map**

Convert the query result into a `Record<string, number>` mapping `last_dispatcher_id` (user_id) to the count of terminated drivers.

**3. Merge into dispatcherStats**

In the `dispatcherStats` map function (line ~1205), add a `turnover` field by looking up `stat.userId` in the turnover map. Default to 0 if not found.

**4. Add sortable column header (line ~2275, after Avg Wk Gross/Dr)**

```tsx
{!isDispatchOnly && (
  <TableHead className="text-right cursor-pointer hover:bg-muted/50" 
    onClick={() => handleSort("turnover")}>
    Turnover {sortBy === "turnover" && (sortDirection === "desc" ? "down" : "up")}
  </TableHead>
)}
```

**5. Add table cell (line ~2320, after Avg Wk Gross/Dr cell)**

```tsx
{!isDispatchOnly && (
  <TableCell className="text-right">
    {stat.turnover > 0 ? stat.turnover : "-"}
  </TableCell>
)}
```

**6. Extend sort state and handleSort**

- Line ~160: Add `"turnover"` to the `sortBy` union type
- Line ~1705: Add `"turnover"` to the `handleSort` column union type

### Behavior
- Counts terminations within the selected date range (consistent with all other columns)
- Shows "-" when count is 0 for cleaner readability
- Hidden from dispatch-only users (same pattern as Avg DH and Avg Wk Gross/Dr)
- Only counts drivers that have `last_dispatcher_id` set (i.e., future terminations after the trigger was deployed)

### Files modified
| File | Change |
|------|--------|
| `src/pages/Analytics.tsx` | Add useQuery for terminated drivers, merge turnover into dispatcherStats, add column header + cell, extend sort types |

