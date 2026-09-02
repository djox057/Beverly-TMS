# Database load analysis (last 3 hours) and fix plan

## What the logs actually show

**Request volume, not errors, caused the 90%+ usage.**

- 118,186 REST requests hit the database in the 13:00 UTC hour alone (~33 requests/second) from a small number of logged-in users.
- Only 12 database errors in the last 3 hours: 9 statement timeouts (8s cap) and 3 `column drivers.full_name does not exist`. Both are symptoms, not the cause — the timeouts happen because the server is saturated.
- 85 idle client connections were open, one active. So it is not connection exhaustion either; it is CPU burned on a few query shapes repeated constantly.

## The four load sources, in order of cost

### 1. Recovery-loads badge in the sidebar (worst single query)

`GET /orders?select=booked_by&retrieval=eq.true&canceled=eq.false` ran **10,535 times in one hour**, mean 273 ms, peak 7.3 s. Cumulatively 300,892 calls / 82,163 seconds of database time.

Why: the hook behind the sidebar badge is mounted on every page for every user. It polls every 30 seconds *and* invalidates itself on **every single change to the orders table** (no debounce, no filtering). It also downloads every matching row just to count them and check one name.

### 2. Realtime fan-out fetching one order at a time

Two global realtime subscriptions (orders grid + reports) both listen to `orders`, `pickup_drops` and `order_transfers`. Every change triggers a flush that issues ~10 separate REST calls, and the logs show those calls carry a **single id** per request:

```text
order_files?order_id=in.(one-id)      574 calls/hr for one order
order_transfers?order_id=in.(one-id)  361 calls/hr for the same order
orders?id=in.(one-id)                 361 calls/hr
companies?id=in.(one-id)            2,941 calls/hr
brokers / drivers / trucks / trailers  ~370 calls/hr each, per id
```

Cumulative totals confirm this is the top consumer overall: 18.8M calls on the single-order `order_files` fetch (304,325 s of DB time), 12.0M on `pickup_drops`, 12.8M on `trailers` by id, 10.2M on `orders` by id. Each call is cheap (3-17 ms) — the cost is the count, multiplied by every open browser tab.

### 3. Unbounded `select('*')` on wide reference tables

| Query | Calls | Mean | Total DB time |
|---|---|---|---|
| `drivers` where `is_active` (all columns) | 1,481,480 | 165 ms | 244,962 s |
| `drivers` ordered by name (all rows) | 299,561 | 444 ms | 132,917 s |
| `brokers` (all rows) | 256,929 | 492 ms | 126,438 s |
| `trucks` where `is_active` (all columns) | 414,696 | 190 ms | 78,956 s |
| `driver_drug_tests` (all rows) | 104,836 | 511 ms | 53,544 s |

These are lists refetched by many components with no shared cache window and no column narrowing. `drivers` alone accounts for roughly 68 CPU-hours.

### 4. Trailer realtime loop reacting to bulk truck updates

The trailers realtime hook reacts to **every** `trucks` row change and then fetches each affected trailer individually, in a loop, with no debounce. The periodic truck-distance/mileage sync updates trucks in bulk, so one background job makes every open tab issue hundreds of sequential trailer fetches. This matches the 12.8M cumulative single-id trailer lookups.

### 5. The two error types (minor, but worth fixing)

- 9 × statement timeout, all on the Reports query joining `orders` + lateral `pickup_drops` + `order_files` filtered by `truck_id IN (...)` and `pickup_datetime >=`, mean 3.6 s and max 7.95 s across 10,735 calls. It only times out under load.
- 3 × `column drivers.full_name does not exist` — a caller selects `full_name` from `drivers` (the column is `name`). Returns 400 every time it runs. Needs to be located (no frontend match; likely an edge function or the load-suggestion path).

## Fix plan

**Phase 1 — stop the badge storm (largest single win, smallest change)**
- Switch the recovery badge to a `head: true, count: 'exact'` count query plus a separate tiny "mine" check, so no rows are transferred.
- Remove the per-orders-change invalidation; keep a single polling interval (60 s) and refetch-on-focus, or debounce the realtime invalidation to one call per 30 s.
- Only mount the hook for roles that can see the badge.

**Phase 2 — batch the realtime flush**
- Widen the debounce window from 1 s to 3-5 s in both realtime hooks so bursts coalesce into one multi-id fetch instead of one fetch per order.
- Merge the two overlapping global subscriptions (orders grid + reports) into one shared flush so relations are fetched once, not twice.
- Skip the enrichment round-trips for entity ids already present in the query cache (trucks/drivers/trailers/companies/brokers lists are already loaded).

**Phase 3 — trailer/truck realtime**
- Debounce the trailers hook and collect affected trailer ids into one batched `.in()` fetch instead of a sequential loop.
- Ignore `trucks` events whose changed fields do not include `trailer_id` (bulk mileage syncs then cost nothing).

**Phase 4 — narrow the reference-table reads**
- Replace `select('*')` with explicit column lists for the `drivers`, `trucks`, `brokers`, `driver_drug_tests` list queries.
- Raise `staleTime` on those list queries (they change rarely) so tabs share one fetch instead of refetching per mount.

**Phase 5 — errors**
- Add a composite index supporting the Reports lateral query (`orders(truck_id, pickup_datetime desc) where not canceled`) and re-check the plan with EXPLAIN to remove the 8 s timeouts.
- Track down and fix the `drivers.full_name` selection.

Phases 1-3 are where the CPU is; 4 and 5 are follow-up hardening. All of it is caching/query-shape work — no behavior or UI change.

## Technical notes

- All figures come from `pg_stat_statements` (cumulative) and the `edge_logs` / `postgres_logs` analytics sources (last 1-6 hours). Edge log retention only covered the current hour, so per-hour trend before 13:00 UTC is unavailable.
- Relevant indexes already exist (`idx_orders_retrieval`, `idx_order_files_order_id`, `idx_pickup_drops_order_covering`, `idx_drivers_is_active`), so this is not a missing-index problem except for the Reports lateral query.
