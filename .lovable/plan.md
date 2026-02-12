

## Add Realtime to Truck Notes

### Problem
The `truck_notes` and `truck_note_history` tables are **not added to the Supabase Realtime publication**. Only `lost_day_notes` is published, which is why lost day notes update in realtime but regular truck notes do not.

The adapter code (`useReportsDateWindowAdapter.ts`) already has the subscription and patching logic for `truck_notes` -- it just never receives any events because the table isn't published.

### Fix

Run a SQL migration to add both tables to the `supabase_realtime` publication:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE truck_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE truck_note_history;
```

This enables:
1. **Inline truck notes on Reports grid** -- when one dispatcher edits a note, all others see it update immediately (existing adapter subscription handles this).
2. **Note History dialog** -- when the dialog is open and another user edits the note, the new history entry appears immediately (existing `useTruckNoteHistory` subscription handles this).

### Technical Details

- **No code changes needed** -- both `useReportsDateWindowAdapter.ts` (lines 744-849) and `useTruckNoteHistory.ts` already have the correct Supabase Realtime subscription and cache-patching logic. They subscribe to `postgres_changes` on these tables, but currently receive zero events because the tables aren't published.
- The fix is a single migration file with two `ALTER PUBLICATION` statements.
- After this migration, the existing subscriptions will start receiving INSERT/UPDATE/DELETE events and patching the TanStack Query cache as designed.

