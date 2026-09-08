# Beverly TMS: realtime, egress, and database audit

**Audit date:** 8 September 2026, UTC  
**Repository:** [djox057/Beverly-TMS](https://github.com/djox057/Beverly-TMS)  
**Code revision:** `e749e5776b8c350f0be7c1c4837ecb19d22f04bc` — “Applied explicit policy fixes”  
**Supabase project:** FleetCarrier, `wjkbtagwgjniilmgwutb`  
**Status:** Read-only analysis. No application changes, database mutations, deployments, statistics resets, or live permission tests were performed.

## 1. Decision

**Beverly can retain realtime behavior while substantially reducing unnecessary traffic.** The largest opportunities are architectural: stop recurring full-list downloads, give each changed entity one shared refresh owner, narrow the audience and contents of events, and separate machine telemetry from human edits.

The current app combines several competing approaches: a shared realtime bus, independent listeners, polling fallbacks, full-list React Query caches, separate report caches, and global order enrichment. Each piece has a purpose, but their interaction creates redundant work and missed-update risks.

The recent RLS improvements appear to have reduced query execution time materially. They do not reduce the number of requests or the bytes returned by `select("*")`.

Recommended sequence:

1. Address the confirmed overly broad database access paths.
2. Consolidate list ownership and remove the cache invalidation cascade.
3. Establish reliable, scoped change delivery before retiring fallback polling.
4. Separate and coalesce HOS/GPS/fuel updates.
5. Replace Analytics history downloads and per-truck Storage listing.
6. Measure billing and freshness together during gradual rollout.

Simply publishing every table would reintroduce a large telemetry fan-out. Simply increasing polling intervals would sacrifice the realtime behavior you want.

## 2. What was inspected—and what remains unmeasured

The audit inventoried 50 page files, 87 hooks, 651 migrations, 118 public database tables, 381 public policies, and 85 deployed Edge Functions. It traced the primary realtime bus, drivers/trucks/trailers, reports, orders, Analytics, Storage listing, authentication/cache lifecycle, and HOS/distance synchronization.

Live checks included publication membership, subscription bindings, grants, relevant policy and function definitions, cron configuration, indexes, advisor findings, aggregate payload sizes, and two query-statistics snapshots. Deployed source for `hos-sync` and `update-truck-distances` was checked against the relevant repository implementation.

This is a deep audit of the performance and realtime paths, not a claim that every business workflow or all 85 deployed function bodies received a complete security review. I did not exercise the production UI as staff or drivers, load-test the system, or obtain browser network traces.

**Unavailable:** the project’s billed monthly message count and egress breakdown, historical CPU metrics, per-route browser request attribution, and end-to-end provider/job logs. Consequently:

- Query duration below is database execution time, not measured CPU time.
- Subscription bindings are not a count of people or unique sockets.
- Serialized JSON sizes are not measured compressed network transfer or billed egress.
- Monthly projections below are explicitly illustrative.

## 3. Current workload: reads became cheaper, but remain frequent

Query statistics were reset at **12:28:06 UTC**. I compared counters at **13:09:59.247** and **13:14:49.076**, an interval of **4.8305 minutes**, with the same reset timestamp.

These are deltas for existing `authenticated` traffic, excluding the audit’s administrative queries:

| Query shape | Calls in interval | Calls/minute | Mean execution time in interval |
|---|---:|---:|---:|
| Drivers, all columns, ordered and paginated | 1,614 | 334.1 | 20.73 ms |
| Truck assignment lookup used by driver enrichment | 805 | 166.6 | 1.84 ms |
| Driver role lookup used by driver enrichment | 805 | 166.6 | 0.70 ms |
| Active drivers, all columns | 453 | 93.8 | 11.45 ms |
| Active trucks, all columns | 496 | 102.7 | 10.67 ms |
| Trailer ID/number lookup | 1,357 | 280.9 | 0.85 ms |
| Order-file metadata query | 763 | 158.0 | 0.38 ms |
| Pickup/drop lookup | 534 | 110.6 | 0.38 ms |
| Trucks, all columns, ordered | 105 | 21.7 | 11.17 ms |
| Brokers, all columns, ordered | 19 | 3.9 | 4.21 ms |

**Correction to the earlier interpretation:** the driver query has `LIMIT/OFFSET`. The current hook fetches pages of 1,000, so 1,574 drivers require two requests. A database query call does not necessarily mean one whole-list download.

The 1,614 driver page calls, together with 805 matching enrichment calls, are consistent with roughly **805 complete driver-list refreshes**, or **167 per minute**, during this sample. This is an inference from code and matching counts; normalized statistics do not reveal every request’s parameter values or completion status.

The old 267 ms driver figure and the new 20.73 ms page average are not a controlled before/after benchmark. They cover different windows and potentially different mixes of pages and roles. Nevertheless, the current sample supports a clear conclusion: **request volume remains excessive after the policy work.**

Do not convert the sum of `pg_stat_statements` durations into a core-utilization estimate. Execution time can include waits and overlapping work. The earlier “57 minutes of CPU” description is not established by those counters alone.

## 4. Measured payload sizes

Aggregate `row_to_json` measurements at **13:12:30 UTC**:

| Dataset | Rows | Sum of serialized row bytes |
|---|---:|---:|
| All drivers | 1,574 | 2,456,902 |
| Active drivers | 420 | 676,594 |
| All trucks | 489 | 699,299 |
| All trailers | 491 | 235,304 |
| All brokers | 2,047 | 656,470 |

A candidate driver lookup projection containing `id, name, company_id, dispatcher_id, is_active` measured **281,959 bytes**, **88.5% smaller** than full driver rows. A broker projection containing `id, name, mc_number` measured **221,137 bytes**, **66.3% smaller**.

These projections are appropriate starting points for dropdowns and lookups. Detail pages and operational grids still need their own required fields.

For scale only: 805 downloads of the measured full driver dataset would serialize approximately **1.98 GB** before compression, excluding enrichment. This is a workload model, **not a measurement of billed egress**. Visibility, pagination parameters, failed/cancelled requests, serialization overhead, and compression affect the real result.

RLS optimization addresses read cost. Projection and request deduplication address payload cost. Both are necessary.

## 5. Findings in the frontend

### F1 — The fallback refresh runs per subscriber, not per dataset

**Priority: high.**  
Sources: [realtimeBus.ts][bus], [useDriversRealtime.ts][drivers-rt], [useTrucksRealtime.ts][trucks-rt], [useTrailersRealtime.ts][trailers-rt].

The bus has a module-wide 60-second timer. For unpublished tables, it stores a separate subscriber object for every registration and calls every available `onResume` callback on the timer and window focus.

A hook’s `useRef` prevents duplication within that hook instance; it does not make all mounted instances share one registration. Registering one callback through `subscribeTables` can also register it repeatedly.

The timer skips hidden tabs, which is useful. Visible tabs still run all their registered callbacks, and focus has no cooldown. Multiple tabs maintain separate buses.

React Query may deduplicate concurrent requests sharing an identical key, so callback count should not be treated as an exact request multiplier. But separate query keys, staggered callbacks, and later invalidations still generate redundant work.

**Fix:** one data refresh owner per authorized dataset/projection, with in-flight deduplication, a dirty-ID queue, and visibility/interest tracking. Keep a bounded recovery mechanism until reliable event delivery is established.

### F2 — Driver refreshes include several entire supporting datasets

**Priority: high.**  
Sources: [useDrivers.ts][drivers], [useTrucks.ts][trucks], [useTrailers.ts][trailers].

`useDrivers` downloads all driver columns in pages, then resolves relationships through truck assignments, companies, profiles, driver roles, and trailers. A complete refresh commonly involves roughly seven to eight requests.

Truck and trailer hooks have their own full-list and supporting lookups. These relationships largely change independently and should not all be reloaded because one driver field changed.

The 30-second `Promise.race` timeouts do not themselves abort the underlying request. Retries can therefore overlap still-running work.

**Fix:** separate lightweight reference caches from operational records; fetch projections suited to each screen; forward cancellation to the actual transport; update only changed entities and affected relationships.

### F3 — Reports create an additional invalidation cascade

**Priority: high.**  
Source: [useReportsDateWindowAdapter.ts][adapter], especially the adapter queries and P6 cache subscription.

The active adapter has independent caches:

- `["adapter-trucks", mode]`: all active truck columns, plus telemetry merging.
- `["adapter-drivers", mode]`: all active driver columns, with an explicit **60-second refetch interval**.

It also listens to QueryCache events. Any `updated` event for a query whose first key is `trucks` or `drivers` schedules invalidation of **both** adapter datasets. The handler does not distinguish successful data changes from other query lifecycle updates.

This means a reference-list refresh can cause another set of report reads even when the actual data is unchanged. Some scope filtering happens after downloading the active fleet.

**Fix:** use one canonical entity source and derive report views locally where appropriate. Replace lifecycle-based invalidation with explicit dependencies on changed fields/IDs. Apply server-side scope when the screen genuinely does not require other authorized records.

The legacy `useReports` fetch path is disabled by the current date-window flag; I did not count its dormant behavior as an additional active poller.

### F4 — One order event can trigger multiple enrichment pipelines

**Priority: high.**  
Sources: [App.tsx][app], [useReportsRealtime.ts][reports-rt], [useOrdersRealtime.ts][orders-rt], [ordersFlatBatchFetch.ts][enrichment], [adapter][adapter].

`AppContent` mounts report realtime handling globally, outside the route-specific screens. Every relevant order/pickup/transfer event can trigger order retrieval and relationship enrichment, even when the current page does not display those orders.

Orders and Analytics mount another consumer. Reports have an additional adapter path. The global enrichment utility can fetch multiple child tables and entity types for one batch.

The shared socket eliminates some duplicate transport subscriptions inside a tab. It does not eliminate those independent database reads.

**Fix:** one order change coordinator batches IDs and obtains each required projection once. Mounted views consume that result. A small global badge or alert feed should not require loading complete order details.

Keep batching, but add a maximum flush delay: a debounce that continually resets can indefinitely postpone updates during sustained activity. Bound request concurrency, and requeue failed IDs.

### F5 — The app does not currently have realtime coverage for everything

**Priority: high for correctness.**

Live publication membership and the bus allowlist agree on only:

- `orders`
- `pickup_drops`
- `order_transfers`
- `truck_notes`

Other code subscribes directly to tables such as brokers, companies, profiles, roles, permissions, histories, and salary payments. Direct Postgres listeners on unpublished tables do not receive those changes, and do not automatically receive the bus fallback.

Conversely, several bus consumers are polling rather than receiving events. In `useDriversRealtime`, the registered table is currently `trucks`; other defined handlers do not make driver changes realtime by themselves.

**Fix:** build an explicit coverage map for every user-visible domain. Give each one a real event source and a defined recovery path. Do not solve the gap by publishing every frequently written table.

### F6 — Subscription filters are applied too late to reduce delivery traffic

**Priority: high.**  
Source: [realtimeBus.ts][bus].

The bus registers unfiltered `postgres_changes` bindings per table. Its adapter evaluates supplied filters in JavaScript after delivery. Unsupported or missing-field cases can pass through the local matcher.

At the live snapshot:

| Table | Authenticated bindings | Anonymous bindings |
|---|---:|---:|
| Orders | 105 | 10 |
| Pickup/drops | 101 | 10 |
| Order transfers | 101 | 10 |
| Truck notes | 54 | 0 |

These were unfiltered bindings. They are **391 table-binding rows**, not 391 users. RLS may prevent delivery to a binding; anonymous bindings do not by themselves prove anonymous order access.

**Fix:** scope delivery at the server where possible, and separate page interest from authorization. Office filters in the UI are not necessarily the full access model: cross-office workflows must continue to work.

### F7 — Reconnects and cache invalidation can leave stale data

**Priority: high for correctness.**

Several concrete issues require attention before removing polling:

- `busChannel.subscribe(callback)` reports `SUBSCRIBED` immediately; it is not reporting actual channel readiness.
- The underlying subscription lacks a central status/error/recovery handler.
- Adding or removing a table rebuilds the whole channel, creating a potential event gap.
- Important global consumers omit the bus’s resume callback.
- `["reports-date-window"]` does not match a first key such as `"reports-date-window-orders"`. String prefixes inside a key segment are not query-key family matching.
- The order-file module cache has no general expiry. Query invalidation alone does not clear its separate “already loaded” set.
- If an order-file page request fails, the code exits the loop but can still mark the whole requested batch as loaded, preserving empty or partial results.
- Existing row patches do not consistently reevaluate filtered-list membership, counts, and sorting.

**Fix:** truthful channel health, bounded retries, gap reconciliation, version checks, explicit deletion/membership handling, and coherent invalidation across React Query and module stores. Treat failed reads as failures, not authoritative empty datasets.

### F8 — Authentication must partition and clear shared caches

**Priority: high for correctness and privacy.**

There are module-level entity/file stores and a long-lived QueryClient. The inspected sign-out flow clears authentication state but does not centrally clear every query and module cache. Some resets are tied to an individual-mode toggle rather than user identity or permission changes.

Several consumers also instantiate the auth hook directly, contributing repeated profile/role work despite an existing provider.

**Fix:** centralize auth consumption; partition caches and event interests by project/user/access scope; clear sensitive data and detach channels on logout, account switch, or permission loss. Any future cross-tab cache sharing must use the same boundaries.

## 6. Machine telemetry: preserve freshness without broadcasting every write

The project already made a useful separation: `truck_telemetry` is narrow and outside the publication. The Samsara locations path also compares selected truck values before rewriting them. Preserve those improvements.

The remaining high-frequency coupling is HOS data stored on `drivers`.

| Integration path | Observed schedule | Current persistence behavior | Recommended behavior |
|---|---|---|---|
| `hos-sync` | Every 5 minutes | Bulk driver updates include fresh timestamps; no general no-op guard in the bulk helper | Separate operational HOS state; compare values; emit compact changes per completed sync |
| HOS fuel update | Same sync path | Upserts telemetry rows | Persist changed values and track source/attempt freshness separately |
| `update-truck-distances` | Every 10 minutes | Upserts telemetry in small chunks, including unchanged/null/zero states | Guard unchanged values; batch delivery to interested views |
| `samsara-locations` | Frontend refresh approximately every 20 minutes | Server cache approximately 5 minutes | Document actual browser freshness; server cache TTL alone does not make browser data refresh every 5 minutes |

Sources: [hos-sync][hos], [update-truck-distances][distance], [samsara-locations][locations], [useSamsaraLocations.ts][locations-hook], and live function definitions.

A separate table-write sample, **13:09:33–13:14:49 UTC**, showed approximately **364 driver updates** and **905 telemetry updates**. This is a different interval from the query table above. Tuple-update counters do not establish that values changed, nor do they equal billable messages.

### Two backend defects worth fixing

**The distance-job lock does not protect the whole job.** The live helper acquires `pg_try_advisory_xact_lock` through a separate RPC. That transaction ends when the RPC returns, before the remaining Edge Function work. A later unlock call does not turn it into a workflow-wide lock.

Use an atomic lease with an owner token, expiry, and guarded renewal/release, or keep the protected database work within one transaction. A pooled session lock spanning unrelated REST requests is not a reliable substitute.

**HOS update counts can be misleading.** The live bulk helper runs two UPDATE statements but retrieves `ROW_COUNT` only after the second. The returned count therefore does not represent both branches. Fix counting independently from the traffic changes.

The existing timestamp check in the HOS handler is also not an atomic claim on a job. Concurrent invocations can pass it together.

### Data semantics to preserve

Use separate concepts for:

- The source observation time.
- The last successful fetch time.
- The last attempt and its result.
- The time/version when business values changed.

Zero, missing, stale, and unknown must remain distinct. Preserve the last valid value when a provider request fails, while visibly showing its age. Do not suppress freshness information merely to suppress events.

Realtime delivery after a five-minute source poll means the UI receives the result promptly when the poll completes. It cannot promise second-by-second source freshness without changing the provider acquisition strategy.

## 7. Analytics and Storage are separate, substantial opportunities

### Analytics defaults to downloading the order archive

Sources: [useOrdersWithProgress.ts][analytics-loader], [Analytics.tsx][analytics], [useAnalyticsAggregates.ts][aggregates].

The loader’s comments imply aggregates are the default. Actual code enables them only when `localStorage.analytics_use_precomputed === "true"`. The normal path loads unlocked orders and then locked history in pages, with concurrent requests.

The database contained **46,121 orders: 45,716 locked and 405 unlocked**. The loader itself is not constrained by the selected Analytics date range.

**Fix:** use server-side aggregates grouped for the requested timeframe and dimensions, plus scoped recent/live records for drill-down. The existing aggregate path is a starting point, but still fetches daily rows and aggregates in the browser; merely flipping the flag is not a complete solution.

Validate money, mileage, lock/unlock transitions, recovery loads, company attribution, and date semantics before rollout. Existing realtime cache behavior also needs adjustment so a newly locked order cannot remain in the unlocked contribution and be counted twice.

The main Orders page already uses a progressive/paginated path. It should not be described as always downloading the entire archive.

### Live Oil Change lists Storage once per active truck

Source: [LiveOilChange.tsx][oil].

The page obtains active truck IDs and performs a `Promise.all` of `storage.list(truckId, { limit: 1 })`. With **476 active trucks**, one run can issue **476 Storage listing requests**. Uploading a file triggers the whole map to refetch.

**Fix:** maintain authorized metadata for the latest odometer file per truck and obtain it in one scoped database query. Update that metadata as part of the upload workflow, with reconciliation for failed or removed uploads. Open the Storage object only when the user views it. Bounded concurrency is a useful interim improvement, but does not eliminate the request count.

Other file downloads inspected were largely user initiated; I did not find evidence sufficient to call every PDF download waste. Measure file/download egress separately. Reuse generated documents by source version and use appropriate previews where useful, without making private documents public.

## 8. Database access findings requiring prompt attention

These are confirmed catalog findings, not hypothetical performance warnings.

### Anonymous master-data reads

The live database grants `anon` SELECT on `drivers`, `trucks`, `trailers`, and `truck_telemetry`. Each also has an anonymous SELECT policy with `USING (true)`.

RLS being enabled does not protect rows that a matching policy explicitly permits. Validate whether any intentional anonymous workflow depends on these paths, then replace broad master-table access with narrowly authorized data access.

I did not retrieve private row contents as an anonymous user or test an exploit.

### Privileged bulk functions callable by anonymous clients

The inspected `bulk_update_hos` and legacy `bulk_update_truck_distances` functions are SECURITY DEFINER, executable by `anon` and `authenticated`, and their bodies lack a caller authorization guard. They perform privileged updates.

Restrict execution to intended backend callers and review dependent jobs first. The legacy distance function still writes truck columns despite the new telemetry path; retire it if it has no legitimate caller.

The advisor reported 45 anonymous-callable SECURITY DEFINER findings. That is a review queue, not proof that every function is exploitable—some may be guarded helpers or trigger functions.

### Broadcast authorization is too broad for the proposed design

Current `realtime.messages` policies check operational roles but do not constrain topic membership. The truck OOS channel is created without `private: true`, and its frontend handler trusts a client-sent truck/OOS payload for a local override.

For authoritative events, generate them from the committed database operation, use private topics, enforce membership, and restrict client publishing of server-owned state events. An office or driver topic name is not an authorization check.

Supabase’s authorization mechanism requires both appropriate topic policies and private channel configuration. Project-wide enforcement also requires reviewing its public-channel setting. See [Realtime authorization][doc-auth].

### Index and advisor findings need interpretation

The performance advisor returned warnings including 61 unindexed foreign keys, 101 unused indexes, 182 multiple-permissive-policy findings, and three duplicate indexes. Existing indexes already cover several important joins.

Do not create all suggested indexes or drop all “unused” ones after a short statistics window. Prioritize authenticated query plans and the remaining expensive paths; examine representative workloads and write overhead.

RLS-enabled tables with no policies can intentionally be service-only. Adding policies just to remove a warning may weaken that design.

## 9. Assessment of the SQL rewrite you pasted earlier

The underlying optimization—evaluating a request-constant identity/role lookup once—is sound when the subquery is genuinely independent of the row. The pasted command is too brittle for a general policy migration.

Specific concerns:

1. It rewrites deparsed SQL with regular expressions. Formatting, schema qualification, nested expressions, casts, and function signatures can make replacements miss or behave differently.
2. The skip check is case-sensitive and expects lowercase `select`; deparsed expressions commonly contain uppercase `SELECT`. Conversely, any matching wrapper causes the entire policy to be skipped, even if another expression still needs work.
3. Wrapping a row-dependent helper does not make it constant. A call based on the current row’s ID still requires row-dependent evaluation.
4. Dropping and recreating policies is unnecessary when only USING/WITH CHECK expressions change. It also complicates metadata preservation and review.
5. A five-second lock timeout limits lock acquisition waits; it does not cap the total runtime of the migration.

The DO statement’s work is transactional: a failure rolls back its changes. It does not inherently expose a committed interval between DROP and CREATE. That is not the reason to reject it.

Use **explicit, policy-by-policy ALTER POLICY migrations**, preserving role lists, command types, permissive/restrictive behavior, and implicit WITH CHECK semantics. Verify each role’s allowed and denied operations and inspect its actual query plan. PostgreSQL documents expression changes through [ALTER POLICY][doc-alter].

Today’s live policies already contain explicit request-constant wrappers in relevant places, so do not rerun the earlier regex script indiscriminately. Correlated own-record branches still require individual review. The current evidence does not justify promising a universal 100× improvement.

## 10. Proposed realtime design

The goal is: **every relevant business change reaches the appropriate active view promptly, and a reconnect repairs anything missed.**

| Data category | Initial load | Live update | Recovery |
|---|---|---|---|
| Orders, assignments, pickup/drops | Authorized active window/projection | Compact change IDs or permitted fields, batched through one owner | Versioned catch-up with deletions and scope moves |
| Drivers/trucks/trailers reference data | Lightweight shared lookup cache | Human-edit events; update affected records | Small scoped reconciliation |
| HOS/fuel/distances | Narrow current telemetry snapshot | Coalesced meaningful deltas after source sync | Last-good snapshot plus visible freshness |
| Brokers/companies | Small searchable lookup projection | Low-frequency reference events | Refresh dirty records on use |
| Documents | Metadata for visible records | File metadata/version changes | Reconcile relevant file IDs |
| Analytics | Server aggregates for chosen dimensions/window | Invalidate or patch affected aggregate buckets | Recompute affected buckets |
| Permissions/roles | Current authorized session state | Restricted permission-change signal | Reauthorize, clear affected caches, rejoin |

### A. One owner for receiving and fetching changes

A shared coordinator should own:

- Actual channel status and interests of mounted views.
- A bounded, deduplicated dirty-entity queue.
- Required projections and in-flight fetches.
- Entity versions and application to the relevant caches.
- Retry/reconciliation after errors and reconnects.

Consumers should not independently enrich the same order because they received the same callback. Update relationships only when dependent fields change.

Cross-tab coordination can reduce duplicate work further, but comes after this correction. It needs leader failover and project/user/access partitioning, and should union the interests of visible tabs.

### B. Events carry the minimum useful authorized information

For low-volume reference changes, a deduplicated Postgres Changes subscription can be sufficient. For high-volume telemetry, a compact, private Broadcast feed allows deliberate batching and payload design.

Broadcast is not inherently cheaper when it sends the same number of events to the same audience. Savings come from suppressing no-ops, narrowing recipients, coalescing updates, and reducing payloads.

Generate authoritative events from committed writes, through a database trigger or a transactional outbox in an application-owned schema. Avoid a client-only “save, then best-effort broadcast” sequence.

When a record changes office/company/driver assignment, update both the old view and the new view without exposing unauthorized fields. Use explicit tombstones or membership changes for deletion/removal. Do not assume old-row payloads always contain all relationship fields under RLS.

### C. Realtime requires reliable recovery

The initialization protocol needs a confirmed subscription and a snapshot boundary so changes during loading cannot disappear. Buffer events while loading, reconcile versions, and ignore stale duplicates.

On disconnect, tab resume, or permission change, perform a scoped catch-up. A simple timestamp cursor—or sequence allocated before commit—does not alone guarantee that concurrent commits cannot be skipped. Choose commit-safe delivery semantics or overlap/deduplication plus bounded reconciliation.

Use a small jittered version check only when needed for recovery or stale state. Do not replace a full-list poll with an equally expensive “catch-up” on every focus.

### D. Proposed freshness targets

These are acceptance targets, not measurements of the current app:

- Human operational edits: p95 visible to another connected authorized viewer within two seconds.
- Sustained edit streams: maximum batching delay, rather than a debounce that can postpone indefinitely.
- Telemetry: visible promptly after the source sync finishes, with source observation age displayed.
- Hidden views: no repeated full-detail refreshes; reconcile before displaying them again.
- Permission loss: sensitive cached data cleared and subscriptions reauthorized.

## 11. How message count and egress change

Supabase counts a Postgres change per receiving client. Broadcast counts the send plus receiving clients. Consequently, one socket is not one billable message, and one truck edit is not necessarily one message across the fleet. See [message accounting][doc-messages].

**Illustrative scenario, not this project’s measured monthly usage:**

Assume 400 machine-row events every five minutes, 100 recipients continuously connected, and 30 days:

| Delivery strategy | Illustrative monthly messages |
|---|---:|
| 400 individual Postgres changes to 100 recipients | 345,600,000 |
| One compact batch per interval to 100 recipients | 872,640 |

The second case assumes each batch fits the relevant payload limits. If it needs K messages, multiply that case by K. Office splitting, active hours, actual changed rows, and additional human events alter both totals.

Batching alone does not remove the underlying data bytes. Small fields, fewer changed rows, smaller audiences, and fewer follow-up queries reduce egress.

Supabase accounts for outgoing data across database, Storage, Edge Functions, Realtime, and other services. Cached Storage egress is separately metered; a CDN does not make all traffic free. See [egress accounting][doc-egress].

The highest-confidence quantified opportunity here is the **88.5% smaller driver lookup projection**. A whole-project savings percentage would require the billing mix and representative before/after measurements.

## 12. Implementation and rollout plan

| Stage | Concrete work | Gate before widening rollout |
|---|---|---|
| 0 — Baseline and access | Capture project billing breakdown; review anonymous policies and bulk-function callers; add route/entity counters | Intended staff, driver, and backend access preserved; unauthorized paths denied |
| 1 — Shared reads | Canonical driver/truck/trailer projections; deduplicated refresh ownership; remove P6 lifecycle cascade; abort real requests | Mounted consumers share work; correct relationships; no extra full-list traffic from focus bursts |
| 2 — Reliable live changes | Truthful status, scoped authorized events, dirty-ID batching, retry and gap recovery | Two-client edits, reconnects, deletions, scope moves, and permission changes pass |
| 3 — Telemetry | Separate HOS master coupling; no-op guards; job lease; accurate counts; compact sync batches | Provider failure retains last valid state; stale/zero/null distinct; overlapping jobs safe |
| 4 — Large reads | Analytics aggregates with parity checks; latest-file metadata query | Financial totals match; uploads/deletes reflected without fleet-wide Storage listing |
| 5 — Tune and expand | Cross-tab deduplication if worthwhile; measured indexes; rollout by role/company/page | Freshness and service-specific usage improve under representative traffic |

Use independent feature flags so a telemetry issue does not require reverting the data cache or Analytics work. Start with a small staff cohort, then cover drivers and restricted roles explicitly.

A rollback should return to a bounded, scoped refresh path. Restoring the unconditional full-fleet minute poll would restore the original pressure.

### Verification checklist

Run these meaningful checks during implementation:

1. Two staff clients: create/edit/assign/delete an order; both views update, including counts and sort position.
2. Move records into and out of a visible office/driver/date filter.
3. Update the same entity from the UI, an integration, and a backend job.
4. Disconnect during edits, hide/resume the tab, change routes while loading, and reconnect with an expired session.
5. Deliver duplicate/out-of-order events and fail a batch fetch; recover without permanent missing records.
6. Sign out and sign in as another role; cached data and subscriptions do not carry over.
7. Confirm driver-only and anonymous access is limited, including realtime topics and privileged RPCs.
8. Repeat an unchanged telemetry payload, then a changed value, then a provider timeout.
9. Compare Analytics totals across lock/unlock, recovery, timezone/date, and company cases.
10. Upload/delete one odometer file and verify that only its metadata refreshes.

### Measurements that determine success

Instrument requests and events without logging payloads containing personal or financial data:

- Route, entity type, projection, reason for fetch, calls, response size where measurable.
- Events received, unique changed IDs, batches, redundant fetches avoided.
- Actual subscription state, recovery attempts, event-to-visible latency.
- Integration rows fetched, values changed, no-op writes skipped, sync failures.
- Database calls/minute and interval execution times by authenticated query shape.
- Project-specific daily realtime messages and egress by service.

During a steady idle interval, active screens should not repeatedly download whole reference tables. Measure startup, shift-change concurrency, edits, and ordinary working hours separately.

## 13. What I would preserve

Several existing choices are useful and should form the starting point:

- One bus binding per published table within a tab.
- Hidden-tab pausing.
- Changed-order ID batching.
- Date-window report loading and progressive Orders loading.
- Narrow `truck_telemetry` storage outside the raw publication.
- Existing Samsara comparison guards.
- Today’s explicit RLS improvements.
- File history/details fetched when the user opens them.

The work is to make those choices consistent across the app and close the correctness gaps between them.

## 14. Remaining evidence needed for an exact cost forecast

Obtain the Supabase Usage view filtered to **FleetCarrier**, over a representative seven-day period and the current billing cycle, showing:

- Realtime messages.
- Total egress and its database/Storage/Edge Functions/Realtime breakdown.
- Cached egress separately.
- The morning incident period if retained.

Pair that with a short network capture for Reports, Orders, Analytics, and Live Oil Change under representative permissions. Those measurements will let us attribute the bill and set a realistic monthly message/GB budget.

**Recommendation:** proceed with targeted cache/event ownership and telemetry changes. The evidence supports substantial avoidable work. It does not support sacrificing realtime everywhere, blindly publishing all tables, or predicting a precise monthly bill from a five-minute database sample.

---

## Evidence links

Repository links below are pinned to the audited revision. Live catalog observations and counter samples are timestamped in this report.

[bus]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/realtimeBus.ts
[drivers]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useDrivers.ts
[trucks]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useTrucks.ts
[trailers]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useTrailers.ts
[drivers-rt]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useDriversRealtime.ts
[trucks-rt]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useTrucksRealtime.ts
[trailers-rt]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useTrailersRealtime.ts
[adapter]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useReportsDateWindowAdapter.ts
[app]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/App.tsx
[reports-rt]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useReportsRealtime.ts
[orders-rt]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useOrdersRealtime.ts
[enrichment]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/utils/ordersFlatBatchFetch.ts
[hos]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/supabase/functions/hos-sync/index.ts
[distance]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/supabase/functions/update-truck-distances/index.ts
[locations]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/supabase/functions/samsara-locations/index.ts
[locations-hook]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useSamsaraLocations.ts
[analytics-loader]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useOrdersWithProgress.ts
[analytics]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/pages/Analytics.tsx
[aggregates]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/hooks/useAnalyticsAggregates.ts
[oil]: https://github.com/djox057/Beverly-TMS/blob/e749e5776b8c350f0be7c1c4837ecb19d22f04bc/src/pages/LiveOilChange.tsx
[doc-auth]: https://supabase.com/docs/guides/realtime/authorization
[doc-alter]: https://www.postgresql.org/docs/current/sql-alterpolicy.html
[doc-messages]: https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages
[doc-egress]: https://supabase.com/docs/guides/platform/manage-your-usage/egress

