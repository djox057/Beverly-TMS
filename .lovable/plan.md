Plan to fix Home Time / lost day notes fetching:

1. Make loaded dates the only source of truth
   - Keep `lostDayNotesLoadedDates` as an authoritative session cache.
   - Once a `YYYY-MM-DD` date is loaded, do not query Supabase for that date again during the page session.
   - Do not do “change checks” or background refreshes for already loaded Home Time dates.

2. Replace the current query-driven fetching with an explicit missing-days loader
   - Refactor the Home Time fetch function into one path like:
     ```text
     requested visible dates -> remove dates already in lostDayNotesLoadedDates -> fetch only remaining dates -> mark them loaded -> update accumulator/UI
     ```
   - The Supabase query will use `.in('date', missingDates)` only for the missing dates.
   - If `missingDates.length === 0`, return immediately with no Supabase request.

3. Stop React Query from re-running Home Time fetches on carousel movement
   - Remove `lostNotesRangeKey` and `lostDayNotesNotifyVersion` from the `adapter-lost-day-notes` query key as fetch triggers.
   - Convert that query to a stable cache/bridge for the accumulated notes, so re-rendering does not cause a fetch.
   - When new dates are loaded, directly update the cached `adapter-lost-day-notes` data from the accumulator instead of invalidating/refetching.

4. Fetch initial dates only once after refresh
   - On Reports load, fetch only `-3 days / today / +4 days` once.
   - Mark those exact dates loaded immediately before the request to prevent duplicate concurrent calls.
   - If the request fails, remove only those failed dates from `lostDayNotesLoadedDates` so they can be retried.

5. Fetch carousel movement only for the new edge day(s)
   - When moving one day forward, fetch only the newly visible right-side date.
   - When moving one day backward, fetch only the newly visible left-side date.
   - If jumping multiple days, fetch only the newly exposed date range, excluding anything already loaded.

6. Preserve updates without refetching
   - Keep optimistic Home Time edits updating the accumulator directly.
   - Keep realtime Home Time inserts/updates/deletes patching the accumulator and query cache directly.
   - Do not invalidate `adapter-lost-day-notes` after edits or realtime events.

7. Update stale project memory after implementation
   - The memory currently says lost day notes use a ±30 day window, which is outdated.
   - I will update it to say Home Time uses `-3/current/+4` initial loading and per-date missing-only carousel loading, with no refetch for already loaded dates.

Files to change after approval:
- `src/hooks/useReportsDateWindowAdapter.ts`
- `src/pages/Reports.tsx`
- `mem://features/reports/lost-day-notes`