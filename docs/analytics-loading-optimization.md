# Analytics loading optimization

Base: `cab10f99fcf209da11b66281fc87d0632c0ee57b`.

## Changes

- Overlap child-record reads and entity lookups in `get-all-locked-orders` and
  `get-all-unlocked-orders` only when `fields: "analytics"` is requested.
- Fetch independent profile, historical-booker, salary-name, role and supervisor
  lookups concurrently, with the existing selected fields and mount freshness.
- Memoize the existing dispatcher-statistics expression with its dependencies.
  The calculations and sort/filter rules themselves are unchanged.

Active orders still finish loading before the archived bootstrap starts. This
preserves the existing protection against missing an order that becomes locked
before the active read finishes. Archived concurrency remains four. Cross-batch
metadata caching and increased concurrency are deferred pending representative
multi-user measurements; no additional cache staleness is introduced.

There are no schema, permission, realtime, export, UI, date-rule, financial-formula,
or precomputed-mode changes. Non-Analytics bulk fetches retain sequential reads.
The same raw rows and child/entity relationships feed the same transformation and
calculation functions. Completion still waits for all archived pages.

## Verification

Dependencies installed with the existing `bun.lock` and `--frozen-lockfile`.

- `npm run test:analytics`: 18 frontend tests plus 13 backend-handler tests pass.
  Covers active-before-archived transitions, duplicate priority, exact-count and
  fallback pagination, four-worker cap, failed reads, individual request filters,
  supervisor cache scope/client selection, precomputed opt-in/admin raw override,
  financial inputs, PODs, full-payload relationships and authentication.
- `node scripts/benchmarks/analytics-parity.mjs cab10f99fcf209da11b66281fc87d0632c0ee57b`:
  48 fixture response/query comparisons pass against the base handlers. Ten
  calculation expressions are identical after unwrapping the added memoization.
  This is offline parity evidence, not a live-data or full UI acceptance claim.
- `NODE_OPTIONS=--max-old-space-size=6144 npm run build`: passed in 39 seconds;
  existing large-bundle/browser-externalization warnings remain. The build's
  unrelated generated MCP output was restored and is not part of this change.
- Deno typecheck: both bulk handlers pass with their pinned Supabase JS 2.49.1
  SDK and local npm dependency resolution.
- Typecheck: fails identically on base and candidate (duplicate generated RPC
  definitions and the existing Trucks insert type error).
- Analytics lint: the same 60 pre-existing diagnostics as base; no added hook
  dependency warning. New test/benchmark files pass lint.
- Visible suite with locked dependencies: candidate 871 passed, 67 failed,
  5 skipped; base 860 passed, 68 failed, 5 skipped. No new failing test names.
  The additional base-only Live Oil Change failure is timing-sensitive. Broad
  checks are not represented as passing.

## Remaining live acceptance and rollout

No production deployment or authenticated browser benchmark has been performed.
The earlier 18–35 second cold-load baseline was modeled from server logs and
request rounds, not measured in a browser. Do not report a measured speedup.

Deploy both bulk-fetch functions and the frontend, then compare the same signed-in
roles and fixed filters/data: settled rows/totals, salaries, invoice/POD indicators,
exports, filter/sort changes, lock transitions, reconnect and account changes.
Capture cold and warm settled-load times and request/error counts under normal
concurrent usage. Keep the old implementation as the parity reference.

Frontend and function changes are independently backward compatible. Rollback is
to revert this change and redeploy the previous frontend/function sources. There
is no database migration or data rollback.

## Saved rollback checkpoint

Remote branch: `rollback/analytics-before-2026-11-11`.
Exact prior commit: `cab10f99fcf209da11b66281fc87d0632c0ee57b`.

The optimization is delivered as one commit on `perf/analytics-safe-loading`.
Its reverse patch was checked locally with `git apply --reverse --check`.

If the PR has not been merged, close it and leave production unchanged. After
merging, use GitHub's **Revert** action on the merged PR (or `git revert` its merge
or squash commit) and merge that revert. Rebuild/redeploy the frontend and both
`get-all-locked-orders` and `get-all-unlocked-orders` from the reverted sources.
Do not reset `main` to the checkpoint: reverting preserves unrelated later work.
If only the backend must be restored first, the exact old function sources are
available on the saved checkpoint branch and remain compatible with either
frontend. No records need to be restored or changed.
