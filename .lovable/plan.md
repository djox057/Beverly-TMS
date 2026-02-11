

## Add "Empty Days" Column + Fix Display Consistency

### Changes (all in `src/pages/Analytics.tsx`)

**1. Import the hook**
Add import for `useDailyDriverStatsByDispatcher` from `@/hooks/useDailyDriverStats`.

**2. Call the hook (~line 333, after turnoverMap)**
```typescript
const { data: dispatcherDailyStats } = useDailyDriverStatsByDispatcher(
  turnoverFromDate || "", turnoverToDate || "",
  selectedOffices.length === 1 ? selectedOffices[0] : undefined
);
```
Reuses existing `turnoverFromDate`/`turnoverToDate` strings (already "YYYY-MM-DD" format). When date range not set, passes empty strings which will return no data -- the hook's query returns empty array, lookup defaults to 0.

**3. Build empty days lookup map (after the hook call)**
```typescript
const emptyDaysMap = useMemo(() => {
  const map: Record<string, number> = {};
  (dispatcherDailyStats || []).forEach(s => {
    map[s.dispatcher_id] = (map[s.dispatcher_id] || 0) + s.lost_day_count;
  });
  return map;
}, [dispatcherDailyStats]);
```
Note: `lost_day_count` already includes reschedule-added days per the walkback algorithm.

**4. Merge into dispatcherStats (~line 1276)**
Add `emptyDays: emptyDaysMap[validUserId] || 0` alongside the existing `turnover` field.

**5. Extend sort type and handleSort**
- Add `"emptyDays"` to the `sortBy` union type (line 160)
- Add `"emptyDays"` to `handleSort` column type (line 1735)

**6. Add column header (after Turnover header, ~line 2308)**
```tsx
{!isDispatchOnly && <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("emptyDays")}>
  Empty Days {sortBy === "emptyDays" && (sortDirection === "desc" ? "down" : "up")}
</TableHead>}
```

**7. Add table cell (after Turnover cell, ~line 2356)**
```tsx
{!isDispatchOnly && <TableCell className="text-right">
  {stat.emptyDays > 0 ? stat.emptyDays : "-"}
</TableCell>}
```

### Display consistency
Turnover and Empty Days both show "-" for zero (count metrics). Avg DH and Avg Wk Gross/Dr show "0" / "$0" for zero (rate/dollar metrics). This distinction is intentional -- count metrics showing "-" means "none" while rate metrics showing 0 is mathematically meaningful.

### Caveat
Today's empty days won't appear until the nightly snapshot runs at 23:59 Chicago time. For date ranges that include today, the count will be missing today's data. This is acceptable for a performance review metric.

### Files modified
| File | Change |
|------|--------|
| `src/pages/Analytics.tsx` | Import hook, call it, build lookup, merge into stats, add column + cell, extend sort |

