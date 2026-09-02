# Corrected database load analysis and fix plan

## Corrections to my earlier analysis

- `pg_stat_statements.total_exec_time` is **cumulative query execution time** (includes I/O and waiting), not CPU time. The `drivers` figure is "≈68 hours of cumulative database execution time", not CPU-hours.
- Those cumulative totals are **not** last-3-hours activity. Verified: `stats_reset = 2026-06-17 14:03 UTC`, so every cumulative number covers a **77-day window**. They rank query shapes by lifetime cost; they do not prove current load.
- The "85 idle / 1 active connection" reading is a **single point-in-time sample** at 13:37 UTC. It shows connections were not exhausted at that instant; it does not rule out earlier spikes. Supabase does not retain per-minute connection history in the log sources available here, so earlier spikes remain unverified.
- React Query cache is **per browser tab**. Raising `staleTime` removes duplicate fetches between components inside one tab; each additional tab still issues its own requests. So caching alone cannot fix fan-out.

## Evidence, separated by source

**A. Current-hour edge logs (13:00-14:00 UTC, the only hour retained)**

- 118,186 total requests (~33 req/s).
- Client concentration: 83,469 requests from a single Chrome version across **7 IPs**, plus 17,579 from another across 6. This is a handful of browsers, not a large user base.
- Top single query: `GET /orders?select=booked_by&retrieval=eq.true&canceled=eq.false` — **9,512 calls in one hour**.
- Writes in the same hour: `PATCH /rest/v1/trucks` **1,745 calls**, all from `Deno/SupabaseEdgeRuntime`, each `?id=eq.<one-uuid>` — an edge function updating trucks **one row at a time**, roughly 350 rows × 5 runs/hour.
- Only 18 `PATCH /orders` and 21 `PATCH /pickup_drops` in that hour.
- Dozens of distinct `GET /orders?select=*&id=in.(1-2 uuids)` shapes at ~175-182 calls each per hour (≈ every 20 s per shape), plus matching single-id `order_files`, `order_transfers`, `trucks`, `drivers`, `trailers`, `companies`, `brokers` lookups (~360-575/hr each).
- 476 `POST /storage/v1/object/list/truck-odometer-files` and 456 `POST /dat_lane_lookups`.

**B. Last-3-hour Postgres logs**

- 12 errors total: 9 × `canceling statement due to statement timeout` and 3 × `column drivers.full_name does not exist`.
- All 9 timeouts are the same Reports statement: `orders` + lateral `pickup_drops` + lateral `order_files`, filtered `orders.truck_id = ANY($5) AND orders.canceled = $6 AND orders.pickup_datetime >= $7`, ordered by `orders.pickup_datetime DESC`.

**C. Cumulative pg_stat_statements (77 days since 2026-06-17)**

| Query shape | Calls | Mean | Cumulative exec time |
|---|---|---|---|
| `order_files` by `order_id = ANY(...)` | 18.8M | 16 ms | 304,326 s |
| `drivers` where `is_active`, all columns | 1.48M | 165 ms | 244,963 s |
| `order_files` (order_id, file_category) | 1.38M | 164 ms | 226,198 s |
| `pickup_drops` by `order_id = ANY(...)` | 12.0M | 16 ms | 193,044 s |
| `drivers` ordered by name, all rows | 299K | 444 ms | 132,917 s |
| `brokers` all rows | 257K | 492 ms | 126,438 s |
| `orders?select=booked_by&retrieval` | 301K | 273 ms | 82,164 s |
| Reports lateral-join query | 10,735 | **3,603 ms** (max 7.95 s) | 38,682 s |

## Confirmed root causes

1. **Recovery-loads badge (`src/hooks/useRecoveryLoadsCount.ts`)** — confirmed. Mounted in `src/components/Sidebar.tsx:150` for every user on every page. It (a) polls every 30 s, (b) invalidates on **every** `orders` change via a wildcard subscription, and (c) downloads all matching rows to count them and test one name in JS. 9,512 calls/hour, mean 273 ms.
2. **Per-row `PATCH /trucks` from an edge function** — confirmed as the realtime amplifier. `public.trucks` has `REPLICA IDENTITY FULL`, so each of those 1,745 updates/hour broadcasts a full-row payload to every subscribed tab. `useTrucksRealtime` and `useTrailersRealtime` both listen to `table: "trucks"`/`"trailers"` with no field filter, so a routine sync makes every open tab re-fetch trucks and trailers.
3. **`useTrailersRealtime` sequential loop** — confirmed by reading `src/hooks/useTrailersRealtime.ts:107-127`: on every `trucks` event it `await`s one `fetchSingleTrailer` per affected trailer inside a `for` loop, with no debounce and no batching.
4. **`drivers.full_name` does not exist** — confirmed, two callers: `supabase/functions/send-stop-amount-approval/index.ts:126-131` (`.from("drivers").select("full_name")`) and `supabase/functions/mcp/index.ts:79`. The column is `drivers.name`. Effect: driver name silently missing from stop-amount approval emails, plus a 400 per call.
5. **Unbounded `select('*')` reference reads** — confirmed by the cumulative table above and by `.select("*")` in `useTrailersRealtime`, `useTrucksRealtime` and the reports flush path.

## Hypotheses still to prove before touching code

- **What produces the repeated 1-2 id fetch shapes every ~20 s.** Realtime cannot explain it: only 18 order PATCHes and 21 pickup_drop PATCHes happened in that hour. Candidates: multiple simultaneously-mounted realtime hooks (`useOrdersRealtime` is called from `useOrders`, `useOrdersProgressive` **and** `useOrdersWithProgress`, all creating the same channel topic `orders-realtime-global`, while `useReportsRealtime` runs a second overlapping global subscription from `App.tsx:100`), or a per-row hook refetching on a short interval. This must be measured in an instrumented browser session before changing the realtime code.
- **Whether the Reports statement needs a new index.** Confirmed that `pickup_datetime` belongs to `public.orders` (it appears as `"public"."orders"."pickup_datetime"` in the captured SQL), so an `orders`-side index is at least on the right table — but no index gets added until `EXPLAIN (ANALYZE, BUFFERS)` on the reconstructed statement shows the plan needs it, and any partial predicate must match the real `canceled` semantics including NULLs.
- **Whether earlier connection spikes occurred.** Unverified; no retained history.

## Changed-field detection: what is actually possible

Verified replica identities: `orders`, `trucks`, `pickup_drops`, `order_files` = **FULL**; `trailers`, `drivers`, `companies`, `order_transfers` = **default** (old record carries only the primary key).

So for `trucks` events, comparing `payload.old.trailer_id` vs `payload.new.trailer_id` is reliable **today**, but it depends on a replica-identity setting that is easy to change by accident. Plan: gate on the comparison only where `FULL` is confirmed, and treat the durable fix as narrowing the subscription itself (drop the blanket `trucks` listener from the trailers hook and let assignment writes publish a dedicated signal). No behaviour will rely on `old` values for `trailers`/`drivers`.

## Files and database objects to change

| Target | Change |
|---|---|
| `src/hooks/useRecoveryLoadsCount.ts` | Remove per-orders-change invalidation; call one RPC; 60-120 s poll; accept a gating flag |
| `src/components/Sidebar.tsx` | Only mount/enable the badge hook for roles that can open Recovery Loads |
| new DB function `public.get_recovery_loads_badge()` | Returns `(total int, has_mine bool)` in one indexed query, using `idx_orders_retrieval` |
| `src/hooks/useTrailersRealtime.ts` | Debounce + single batched `.in()` fetch; stop reacting to unrelated `trucks` updates |
| `src/hooks/useOrdersRealtime.ts`, `src/hooks/useReportsRealtime.ts`, `src/App.tsx` | One shared in-tab realtime coordinator; single channel; one batched request per relation |
| `src/hooks/useTrucksRealtime.ts` | Explicit columns instead of `select("*")`; ignore non-assignment truck updates |
| `supabase/functions/send-stop-amount-approval/index.ts`, `supabase/functions/mcp/index.ts` | `full_name` → `name` |
| The edge function issuing per-row `PATCH /trucks` | Batch the writes (or write to a side table) so one sync is not 350 realtime broadcasts |

## Phased implementation

**Phase 0 — baseline (no code change).** Snapshot `pg_stat_statements` rows for the target shapes with a timestamp, plus current-hour edge-log counts, so every later claim is a delta over a known interval.

**Phase 1 — recovery badge (largest confirmed win).**
1. Delete the `orders` wildcard invalidation (immediate kill switch).
2. Add `get_recovery_loads_badge()` returning total + `has_mine` in one query; badge calls it with a 60-120 s interval and refetch-on-focus.
3. Gate mounting to eligible roles.

**Phase 2 — realtime fan-out.**
1. Instrument a browser session to record exactly what triggers each repeated single-id fetch, and confirm/refute the duplicate-subscription hypothesis.
2. Build one shared coordinator: a single channel per tab, one accumulator, and **one multi-id request per relation** per flush. Batching and dedup is the fix; the debounce window is only the batching boundary.
3. Remove the duplicate global subscription so orders-grid and reports enrichment happen once.

**Phase 3 — trailers/trucks.** Batch trailer ids into one `.in()` call, delete the sequential loop, and stop trailer/truck refreshes for mileage-only updates. Batch the edge function's per-row truck PATCHes.

**Phase 4 — narrow reads.** Explicit column lists for `drivers`, `trucks`, `trailers`, `brokers`, `driver_drug_tests` list queries; raise `staleTime` on slow-changing lists (in-tab dedup only — stated as such, not as a cross-user fix).

**Phase 5 — Reports query.** Reconstruct the exact statement with real parameters, run `EXPLAIN (ANALYZE, BUFFERS)`, and add an index **only if** the plan shows it is needed; re-EXPLAIN to confirm use.

**Phase 6 — `full_name` fix** in both edge functions, then verify the approval email carries a driver name.

## Behaviour impact (explicit)

UI and business rules stay as they are, with one honest tradeoff: polling at 60-120 s and batching realtime flushes introduce **bounded staleness**. The recovery badge and some grid cells may update a few seconds to two minutes later than today. No feature, permission, calculation or layout changes.

## Acceptance criteria

- Normal REST traffic drops from ~33 req/s to **under 3-5 req/s** at comparable user load.
- Recovery badge: **≤2 DB requests per minute per eligible active tab**, ideally 1.
- One realtime burst = **one batched request per relation**, never one per changed row.
- No sequential per-trailer fetch loop remains in the codebase.
- Database CPU stays **below 50%** at peak.
- Reports statement p95 **under 2 s**, zero statement timeouts over a full business day.
- All before/after numbers come from timestamped snapshots and `pg_stat_statements` deltas over a stated interval — never from lifetime totals.

## Risks and follow-ups

- Changed-field gating depends on `REPLICA IDENTITY FULL` on `trucks`; if that is ever relaxed the gate must fall back to "always refresh", so it is written defensively.
- Merging two realtime subscriptions touches both the Orders grid and Reports; regression checks needed on BOL/POD upload, order cancel/recovery, and driver/truck reassignment flows (the reports flush already carries a comment about rows vanishing when the shape is wrong).
- Batching the edge function's truck writes is a backend change with its own verification (row counts before/after must match).
- 476 storage `object/list` calls and 456 `dat_lane_lookups` inserts per hour are not yet explained; queued as follow-up.
