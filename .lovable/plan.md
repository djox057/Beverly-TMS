## Root cause

Order creation in `src/pages/NewOrder.tsx` is split into two database steps:

1. `supabase.rpc("create_order_with_unique_load_number", ...)` — atomic and **idempotent** via `client_request_id` (unique index `orders_company_client_request_id_uidx`). A retry returns the existing `orders.id` instead of inserting again.
2. `supabase.from("pickup_drops").insert(validPickupDropData)` — runs unconditionally on the client right after the RPC returns. **Not idempotent.** Anything else inserted later (files, etc.) also re-runs.

When the network drops between the two steps (or during step 2's response), the user retries the submit, the RPC short-circuits and returns the same `order_id`, and then the client inserts the same pickup/delivery rows again. That's exactly what happened on load `129063265` (order `659c2eb7-…`): 1 order, but **3 pickups + 3 deliveries** in `pickup_drops`, all identical, sequence_number=1/2 repeated three times. Reports/Load Info aggregate from `pickup_drops` so they show "3p3d", while the Edit Order screen renders the unique 1p/1d configuration.

The same vector explains the multi-row duplicates seen recently for `927819004` (4×) and `1699564` (3×) — those happen to predate `client_request_id` adoption, so the order itself was duplicated; on those, both the orders and pickup_drops multiplied.

## Fix

Two parts:

### A. Make pickup_drops idempotent on retry

In `src/pages/NewOrder.tsx`, after the RPC returns and before inserting into `pickup_drops`:

- Query `pickup_drops` for the returned `order_id` (count or `select id limit 1`).
- If any rows exist, **skip the insert entirely** — the previous attempt already wrote them. Log a console.info so we can see this happened.
- If none exist, proceed with the existing insert path.

This is safe because the RPC only returns an existing order when `client_request_id` matches, meaning the same client submission. The pickup_drop set therefore can only have come from this same submission.

Apply the same "exists check on order_id" guard before re-running:
- file uploads to `order_files` (skip files whose `file_path` already exists for the order),
- any inserts into `order_transfers` / recovery_history that the submit flow performs.

### B. Clean up the existing duplicates for load 129063265

Create a migration that, for `order_id = '659c2eb7-0023-4c3c-8c4a-f5a0bc102dcb'`, deletes the duplicate `pickup_drops` rows, keeping the lowest `id` (or oldest `created_at`) per `(type, sequence_number)`. Six rows → two rows (one pickup seq 1, one delivery seq 2).

Also do a one-time sweep for any other orders with this defect:

```sql
WITH dupes AS (
  SELECT order_id, type, sequence_number, MIN(id) AS keep_id
  FROM pickup_drops
  GROUP BY order_id, type, sequence_number
  HAVING COUNT(*) > 1
)
DELETE FROM pickup_drops pd
USING dupes d
WHERE pd.order_id = d.order_id
  AND pd.type = d.type
  AND pd.sequence_number = d.sequence_number
  AND pd.id <> d.keep_id;
```

(Run as a read-only audit query first to confirm the affected rows, then as a migration.)

### C. (Optional but recommended) Add a defensive unique index

```sql
CREATE UNIQUE INDEX IF NOT EXISTS pickup_drops_order_type_seq_uidx
  ON public.pickup_drops (order_id, type, sequence_number);
```

This catches future regressions at the DB level. Must be created only after step B cleans existing duplicates, otherwise it will fail.

## Verification

- Reload Reports for the driver on this load — pickup/delivery cells render as 1p/1d.
- Open Load Info popover — shows one pickup, one delivery.
- Manually simulate a retry: in dev, throw a fake error after the pickup_drops insert and click Submit again; confirm only one pickup_drops row set exists.
- `SELECT type, sequence_number, COUNT(*) FROM pickup_drops WHERE order_id = '659c2eb7-…' GROUP BY 1,2;` → all counts = 1.

## Files to touch

- `src/pages/NewOrder.tsx` — guard pickup_drops insert (and file/transfer follow-ups) with an "already inserted?" check.
- New migration `supabase/migrations/<ts>_dedupe_pickup_drops_and_unique_index.sql` — cleanup + unique index.
