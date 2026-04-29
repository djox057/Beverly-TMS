## Diagnosis recap

Home Time disappears on refresh because `src/hooks/useReportsDateWindowAdapter.ts` fetches `lost_day_notes` for a static ±30-day window and silently hits PostgREST's 1,000-row cap (current 60-day window contains 1,057 rows). Without an `ORDER BY`, the truncated rows are non-deterministic and tend to drop the newest entries — exactly matching "today and future dates vanish".

## Requested fix

Make the lost-day-notes loader behave like the loads / pickup-drops loader: a small window of **3 days before → current day → 4 days after**, that **expands** as the user navigates the calendar carousel, and **never refetches** ranges already loaded.

This both eliminates the row-cap problem and keeps payloads small.

## Reference pattern (already implemented for orders)

`src/hooks/useReportsDateWindow.ts` already implements the exact pattern we want for orders/pickup-drops:

- A `currentWindow = calculateDateWindow(selectedDate, 'initial')` per render.
- A module-scope `globalAccumulatedOrders` map and `globalLoadedWindows` set: when a window key is already loaded, the queryFn returns immediately.
- The query key includes the `windowKey`, so navigating the calendar fires a new fetch only for the new range; previously fetched ranges stay in the global store.

We will replicate that pattern for `lost_day_notes`.

## Implementation

### File: `src/hooks/useReportsDateWindowAdapter.ts`

1. **Replace the ±30-day window** (lines ~563-574) with the new 8-day window:

   ```ts
   // -3 days before selectedDate through +4 days after (matches orders/pickup-drops behavior).
   const lostNotesDateRange = useMemo(() => {
     const start = new Date(selectedDate);
     start.setDate(start.getDate() - 3);
     const end = new Date(selectedDate);
     end.setDate(end.getDate() + 4);
     const fmt = (d: Date) => d.toISOString().slice(0, 10);
     return { start: fmt(start), end: fmt(end) };
   }, [selectedDate]);
   ```

2. **Add a module-scope accumulator** at the top of the file (next to `orderFilesCacheByOrderId`):

   ```ts
   // Persistent accumulator for lost_day_notes across calendar navigations.
   // Keyed by `${driver_id}_${date}` so updates replace the previous record.
   const lostDayNotesAccumulator = new Map<string, any>();
   const lostDayNotesLoadedRanges = new Set<string>(); // "YYYY-MM-DD_YYYY-MM-DD"

   const lostDayNotesAccKey = (n: { driver_id: string; date: string }) =>
     `${n.driver_id}_${String(n.date).slice(0, 10)}`;

   const ingestLostDayNotes = (rows: any[]) => {
     for (const r of rows) {
       if (!r?.driver_id || !r?.date) continue;
       lostDayNotesAccumulator.set(lostDayNotesAccKey(r), r);
     }
   };

   export const removeLostDayNoteFromAccumulator = (driverId: string, date: string) => {
     lostDayNotesAccumulator.delete(`${driverId}_${String(date).slice(0, 10)}`);
   };

   export const upsertLostDayNoteInAccumulator = (note: any) => {
     if (!note?.driver_id || !note?.date) return;
     lostDayNotesAccumulator.set(lostDayNotesAccKey(note), note);
   };
   ```

3. **Rewrite the `allLostDayNotes` query** to:
   - Use the new 8-day window in its key so each carousel position triggers exactly one fetch.
   - Skip the network when the window is already in `lostDayNotesLoadedRanges` (mirrors `globalLoadedWindows` for orders).
   - Add `.order("updated_at", { ascending: false })` and `.range(0, 9999)` as a defensive cap (8 days will be far below this, but it removes the silent 1000-row footgun forever).
   - Ingest results into `lostDayNotesAccumulator` and return all currently-accumulated rows.

   ```ts
   const lostNotesRangeKey = `${lostNotesDateRange.start}_${lostNotesDateRange.end}`;

   const { data: allLostDayNotes } = useQuery({
     queryKey: ["adapter-lost-day-notes", modeKeySuffix, lostNotesRangeKey],
     queryFn: async () => {
       if (!lostDayNotesLoadedRanges.has(lostNotesRangeKey)) {
         const { data, error } = await supabase
           .from("lost_day_notes")
           .select("*")
           .gte("date", lostNotesDateRange.start)
           .lte("date", lostNotesDateRange.end)
           .order("updated_at", { ascending: false })
           .range(0, 9999);
         if (error) throw error;
         ingestLostDayNotes(data || []);
         lostDayNotesLoadedRanges.add(lostNotesRangeKey);
       }
       return Array.from(lostDayNotesAccumulator.values());
     },
     staleTime: 300000,
     gcTime: 300000,
     refetchOnWindowFocus: false,
     enabled: globalEnabled,
   });
   ```

4. **Wire the realtime + optimistic-update paths** so the accumulator stays consistent (it's the single source of truth now):

   - In the existing realtime handler around line 988 (`lost_day_notes` channel), after computing `newRecord`/`oldRecord`/`eventType`, also call:
     - INSERT / UPDATE → `upsertLostDayNoteInAccumulator(newRecord)`
     - DELETE → `removeLostDayNoteFromAccumulator(oldRecord.driver_id, oldRecord.date)`
   - In `src/hooks/useReports.ts` `updateLostDayNote.onMutate`, after building `newNote`, also call `upsertLostDayNoteInAccumulator(newNote)` (import from the adapter file). On `onError` rollback, restore by calling `upsertLostDayNoteInAccumulator(previousNote)` if there was one, or `removeLostDayNoteFromAccumulator(driverId, date)` if there wasn't.

   This guarantees that when the user marks Home Time and refreshes, the new note is in both the cache and the accumulator, so it survives the refresh and any subsequent carousel scroll.

### Reset behavior

Add a one-line clear inside the existing `individualMode` change effect in the adapter (mirrors how `globalAccumulatedOrders` is cleared in `useReportsDateWindow.ts`):

```ts
// where globalAccumulatedOrders.clear() is invoked
lostDayNotesAccumulator.clear();
lostDayNotesLoadedRanges.clear();
```

This prevents stale notes from leaking across major scope switches.

## Verification

1. Today is the selected date. Mark Home Time on a driver → refresh → icon persists.
2. Mark Home Time 4 days in the future → refresh → icon persists.
3. Scroll the calendar carousel forward by a few days → the new days load their notes; previously loaded days still show their notes (no flicker, no refetch).
4. Scroll back to today → still no refetch (window already in `lostDayNotesLoadedRanges`).
5. Network panel: each carousel move issues at most one `lost_day_notes` request, scoped to the new window only.

## Out of scope

- No DB migration.
- No change to the write path's actual upsert (it was correct).
- `truck_notes` query is unaffected — it already orders by `updated_at desc` and is a smaller table.
- Memory note `lost-day-notes` will need updating from "±30 day window" to "sliding -3/+4 day window with accumulator" once the change is shipped.
