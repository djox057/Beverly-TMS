

## Fix: "invalid input syntax for type date" errors

### Root Cause

In `src/pages/Analytics.tsx` line 338, the `useDailyDriverStatsByDispatcher` hook is called with:
```typescript
useDailyDriverStatsByDispatcher(
  turnoverFromDate || "", turnoverToDate || "",
  ...
)
```

When `turnoverFromDate` or `turnoverToDate` is null/undefined (e.g., before the user selects a date range), empty strings `""` are passed as date parameters. These flow into the `calculate_empty_days_by_dispatcher` RPC, and Postgres rejects `""` as an invalid date.

### Fix

Two-layer defense:

1. **In `src/pages/Analytics.tsx` (line 338)**: Keep passing the values as-is (no change needed here since the hook should handle it).

2. **In `src/hooks/useDailyDriverStats.ts` (`useDailyDriverStatsByDispatcher` hook)**: Add an `enabled` guard so the query only runs when `startDate` and `endDate` are non-empty valid date strings. This prevents the RPC call entirely when dates are missing.

### Technical Detail

In `src/hooks/useDailyDriverStats.ts`, update the `useDailyDriverStatsByDispatcher` hook (around line 320) to add:

```typescript
export const useDailyDriverStatsByDispatcher = (
  startDate: string,
  endDate: string,
  office?: string
) => {
  return useQuery({
    queryKey: ["daily-driver-stats-by-dispatcher", startDate, endDate, office],
    queryFn: () => fetchEmptyDaysByDispatcher(startDate, endDate, office),
    enabled: !!startDate && !!endDate,  // <-- add this guard
    staleTime: 60000,
  });
};
```

This single line addition (`enabled: !!startDate && !!endDate`) prevents the query from firing when either date is empty, eliminating all the Postgres errors.

