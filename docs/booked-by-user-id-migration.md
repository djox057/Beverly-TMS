# Future migration: `orders.booked_by` (display name) → `booked_by_user_id`

**Status: documented only. Do NOT implement in the current phase.**

## Problem

`orders.booked_by` stores a dispatcher's *display name* (`profiles.full_name`).
Display names are mutable and non-unique, so ownership checks — including
`get_recovery_loads_badge()`, Analytics/Reports "my loads" filters, and
dispatcher payroll attribution — are string comparisons against a value that can
change or collide. The current server-side resolution
(`profiles.full_name WHERE user_id = auth.uid()`) preserves today's behavior
exactly, but does not fix the underlying model.

## Migration outline (later, staged)

1. **Add the column, nullable, no behavior change**
   `ALTER TABLE public.orders ADD COLUMN booked_by_user_id uuid;`
   plus an index on `(booked_by_user_id)` and one on
   `(booked_by_user_id, retrieval, canceled)` for the badge path.

2. **Backfill in batches**
   Match `lower(btrim(orders.booked_by)) = lower(btrim(profiles.full_name))`.
   Batch by `created_at` ranges to avoid long locks. Record per-batch counts of
   matched / unmatched / ambiguous rows in a temporary audit table.

3. **Handle duplicate names safely**
   Where a normalized name matches more than one `profiles` row, leave
   `booked_by_user_id` NULL and export the ambiguous set for manual resolution
   (disambiguate by office, active status, or the order's booking company).
   Never guess — a wrong owner silently misattributes payroll.

4. **Preserve historical display names**
   Keep `booked_by` permanently as the historical snapshot (same pattern as
   `deleted_driver1_name`). Reports that must show "who booked it at the time"
   read `booked_by`; ownership logic reads `booked_by_user_id`.

5. **Write both before switching reads**
   Update every writer (NewOrder, EditOrder, recovery assignment, transfers,
   edge functions, `create_order_with_unique_load_number`) to set both columns.
   Only after new rows have both values for a full reporting cycle should reads
   move over, one consumer at a time (badge RPC first, then filters, then
   analytics/payroll).

6. **Avoid breaking reports and filters**
   `get_distinct_booked_by`, dispatcher filters, and saved UI filter values are
   name-based. Provide a name→id resolution layer during the transition and
   compare old-vs-new aggregates for at least one full week before dropping the
   name-based path. Nothing gets dropped in the same release that switches reads.

7. **Backstop**
   A trigger that keeps `booked_by` and `booked_by_user_id` consistent for
   new rows, plus a periodic check for rows with a name but no id.
