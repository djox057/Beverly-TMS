

## Fix: pickup_drops realtime updates not reflecting in Reports

### Diagnosis

After tracing the full data flow, the code logic appears structurally correct:
1. Realtime channel subscribes to `pickup_drops` changes (confirmed active in logs)
2. Handler checks `hasOrderInGlobalStore` and queues order IDs
3. `flushPending` refetches flat order + pickup_drops, patches global store
4. Version bump triggers re-render chain

However, the handler at line 1255-1260 has **zero logging**, making it impossible to confirm events arrive. The most likely issue is that events ARE arriving but something subtle prevents the UI update. Two concrete problems found:

**Problem 1**: No diagnostic logging in the pickup_drops handler — can't verify if events are received or silently dropped.

**Problem 2**: When a NEW pickup_drop is added to an order (INSERT), the `order_id` is captured correctly. But for DELETE events (removing a stop), the Supabase realtime payload for `pickup_drops` with FULL replica identity includes the `old` record. This should work. However, if the `order_id` from the deleted record's `old` payload is somehow not present (e.g., if FULL replica identity isn't actually set correctly for this table), the handler silently drops the event.

### Plan

**File: `src/hooks/useReportsDateWindowAdapter.ts`**

1. Add diagnostic console.log to the `pickup_drops` handler (around line 1255-1260) to log event type, order_id, and whether the order is in the global store — matching the logging pattern used for truck_notes and lost_day_notes handlers.

2. Add the same diagnostic logging to the `order_transfers` handler (line 1263-1268) for consistency.

3. Add a log line inside `flushPending` (after line 1147) that shows how many pickup_drops were fetched, so we can confirm the refetch returns updated data.

These logs will help diagnose whether the issue is:
- Events not arriving (no log at all)
- Events arriving but order not in store (`hasOrderInGlobalStore` returns false)
- Events arriving, order in store, but refetch returns stale data
- Refetch works but version bump doesn't trigger re-render

This is a diagnostic-first approach. If logs reveal a specific failure point, we fix that. If everything logs correctly but UI still doesn't update, the issue is in the React re-render chain.

