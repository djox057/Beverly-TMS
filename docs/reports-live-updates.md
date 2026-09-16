# Reports live updates with bounded data transfer

This change targets `/reports`, based on main `b88e392b61d7ac16214d12b515ec346d670c2588`. It is a proposed database migration plus client change, not a production deployment. The separate `/daily-report` and Analytics pages are outside this PR.

## Confirmed gaps

The production `supabase_realtime` publication currently contains orders, pickup_drops, order_transfers, truck_notes, profiles, and user_roles. Reports subscribed to unpublished order_files and lost_day_notes; its file fallback invalidated a query key that the date-window pipeline does not use. Home-time invalidation returned the same module accumulator without reading the database. Drivers had a full-list 60-second timer. Truck updates depended on other caches/polling. Both the app-level Reports hook and adapter independently fetched changed orders. A separate Samsara location query downloaded a response Reports did not use.

## Resulting behavior

| Data shown in Reports | Update path |
| --- | --- |
| Orders, stop times, transfers, completion flags | Union changed order IDs; fetch batches of at most 100, then stops and transfers; update one store. Empty RLS results evict stale records. |
| Driver details, assignments, trucks, trailers | Notify only after actual row values change; invalidate the relevant projected reference queries. Assignment changes refresh office scope. |
| HOS | Separate version from driver reference changes. Read only ID and six HOS fields; patch the existing driver cache. |
| Fuel and miles-away telemetry | Read the small telemetry projection and patch trucks, including cleared/deleted telemetry. |
| BOL/POD and other file metadata | Invalidate affected order IDs in the module cache. Refresh last-load fallbacks only when affected. |
| Lumper revised-RC indicators | Update affected orders instead of refetching the entire candidate list for every order/file change. |
| Home time | Reload dates already visited, paginate, replace deleted notes, retain failed work for retry. |
| Notes, problems, complaints, drug tests, EFS flags, COI, temporary plates | Invalidate their active query families after a source change. |
| Afterhours assignments and daily-report permission controls | Refresh the map, individual-mode assignment scope, and shared permission query. The separate Daily Report page is unchanged. |
| Dispatcher profiles/extensions and final-update sent markers | Refresh the relevant profile/extension/marker queries. |

A page-owned subscription listens to `reports_live_versions`. The table has 27 rows, one per source/category. Each INSERT/UPDATE/DELETE SQL statement emits at most one update per changed category, with up to 100 identifiers; larger statements emit a full-source reconciliation marker. File/stop/transfer changes include both old and new parent order IDs. It contains no record bodies or document contents. Staff can SELECT; browser roles cannot write. Actual records are always fetched through their existing RLS policies.

The existing production `bulk_update_hos` function uses two set-based UPDATE statements, not a per-driver loop. Thus an HOS synchronization can produce up to two HOS notifications, rather than one per driver, before any other integration writes are considered. Unchanged rows and changes only to the generic updated_at timestamp are ignored. HOS freshness timestamps are retained as meaningful HOS changes. Separate SQL statements remain separate notifications; this does not promise one message for an entire multi-request integration job.

## Recovery and costs

The client batches bursts for 500 ms without continually postponing the first flush. Requests run serially; changes arriving during a read run afterward. Successfully processed sources are acknowledged so a failed badge query does not repeat successful order reads. Failed sources retry after five seconds. Hidden tabs disconnect and stop version reads. Returning to Reports reconciles cached data; reconnects and a visible-tab 60-second heartbeat compare only source/version pairs. A version gap triggers source reconciliation because the latest identifier list cannot reconstruct intervening changes.

Normal connected changes use identifiers. Recovery can require full *scoped* snapshots: correctness after a missed interval costs more than the normal incremental path. Date-window completion flags are cleared and visited dispatcher calendar requests are reloaded, so module caches cannot simply claim the snapshot is already loaded. Superseded order reads are prevented from refilling a reset store. Primary fleet and relation reads paginate past the API row cap.

The old 60-second full driver refresh is removed. HOS-only reads are substantially narrower; telemetry changes do not download truck records. The unused location-function call is removed. A shared-cache watcher ignores unchanged values and only refreshes the reference type that changed. There is still one subscription per visible browser tab, and other pages retain their existing refresh behavior; this PR does not claim cross-tab deduplication or zero egress.

Live means the page reacts to committed database changes. Samsara values cannot become newer than the integration's latest successful synchronization. The displayed connection state distinguishes connecting, updating, live, offline, and failed updates. There is no measured production reduction yet; compare usage after deployment rather than treating fixture batching as a billing forecast.

## Validation

- Focused Vitest tests cover batching, bounded pending sets, retries, preserving successful work, events during a read, account changes, visibility, version gaps, heartbeat recovery, row deletion/RLS disappearance, transfer scope, BOL/POD flags, interrupted reads, reference pagination, and unchanged-cache suppression.
- TypeScript checking and production Vite build are required. Existing build warnings include large chunks and jscanify browser externalizations.
- `scripts/test-reports-live-migration.mjs` runs the actual migration in PGlite PostgreSQL, with minimal source-table fixtures and a staff-role predicate stub. It checks 420-row batching, HOS separation, no-ops, both parent IDs, deletes, alternate primary keys, empty statements, transaction rollback, RLS visibility, denied browser writes, and denied anonymous reads. This is **not** an end-to-end Supabase WebSocket/JWT test.

Run:

```sh
npx vitest run src/utils/reportsLiveQueue.test.ts src/hooks/useReportsLive.test.tsx src/utils/refreshReportsOrders.test.ts src/utils/reportReferenceFields.test.ts src/utils/fetchReportsReferenceRows.test.ts
npm run typecheck
npm run build
npm install --prefix /tmp/reports-sql-check @electric-sql/pglite@0.5.8 --no-audit --no-fund
node scripts/test-reports-live-migration.mjs /tmp/reports-sql-check/node_modules/@electric-sql/pglite/dist/index.js
```

## Deployment and acceptance

1. Apply `20260908221411_reports_live_versions.sql` to a staging copy first. It adds statement triggers to 26 source tables and adds only the compact version table to the publication. It uses a five-second local lock timeout; a failed migration must roll back as one transaction. It does not rewrite existing source-table RLS policies or publish raw fleet tables.
2. Deploy this client to staging and test two authenticated staff sessions. Verify edit/create/delete for orders, moved stops/transfers, BOL/POD flags, upload/delete/move attachments, home time, HOS, telemetry, notes, off-duty assignments, afterhours reassignment, and permission revocation. Test office/individual-mode switches and already-visited calendar dates.
3. Disconnect one browser, change records in the other, reconnect and compare with a fresh page. Simulate failure of one dependent query and verify completed sources are not repeatedly downloaded. Check that initial errors and a missing migration are visible rather than labeled live.
4. Check source-write p95 latency and lock waits. Statement triggers compare transition rows and serialize updates to one revision row per source; this added write work needs a realistic concurrent-write test. Check transaction rollback and publication membership on the deployed PostgreSQL version.
5. Roll out the migration before the frontend, then canary a small set of staff sessions. Verify the deployed WebSocket binding, staff read permissions, JWT refresh and denied unauthorized reads/writes. Rebuild the generated database types after migration as part of the normal schema workflow.
6. Measure comparable visible-session intervals: driver-list request counts, HOS/telemetry response bytes, changed-order/file reads, PostgREST egress, Realtime messages, and trigger latency. Stop rollout if freshness differs from a fresh-page snapshot or write latency regresses.

Rollback: restore the previous frontend first. In a transaction, remove `reports_live_versions` from the publication, drop the three `reports_live_insert/update/delete` triggers from the 26 source tables listed in the migration, drop `public.notify_reports_statement()`, then drop `public.reports_live_versions`. Existing source-table policies and original publication members remain intact. Administrative TRUNCATE/schema operations require coordinated cache reconciliation; these triggers cover normal INSERT/UPDATE/DELETE mutations.

The earlier egress PR #1 overlaps the projected reference fields/cache watcher. This PR incorporates those pieces and retains main's newer on-demand driver editor/name loading. Do not merge conflicting versions of the adapter blindly; the earlier PR's additional dialog changes remain separate work.
