# TMS-02 — Analytics and visible-workflow baseline

Status: **Blocked acceptance; harness implemented.** Base: `c05bc41418d695650ff0e85e0f37c0ce5b900873`.
Step 01 remains completed. Step 02 must not be marked complete until the reference
measurements and role/row/total checks below are captured and reviewed.

This commit adds standalone test tooling and a repeatable recipe. It does not
change production source, permissions, queries, instrumentation or refresh timing.
Existing `playwright.config.ts`, `fetchTrace.ts` and `useOrdersWithProgress.ts`
were inspected and left unchanged. No database changes or deployment are needed.

## Evidence from this implementation

| Check | Result |
|---|---|
| `npm run test:benchmark` | 12 tests passed: fail-closed writes, redaction, sample boundaries, expired sessions, errors, actual route aborts |
| `npm run test:visible` | 220 passed, same five named hidden-board exclusions from TMS-01 |
| `npm run typecheck` | Passed |
| Lint on added JS/TS tooling | Passed, no diagnostics |
| `npm run build` | Passed; existing bundle/browser-externalization warnings |
| Standalone browser fixtures | 2 passed on Chromium 153.0.8010.0, including full runner capture with 12 synthetic samples, reconnect and distinct isolated sessions |
| Live sign-in | Verified through secure browser authentication; supplied account has primary role **admin** |
| Live Analytics structure | One rendered table, 153 body rows and 12 header cells at the observed default admin view |
| Live Reports structure | 28 rendered tables, 143 body rows combined, 15 header cells per table at the observed default admin view |
| Cold/warm network bytes, usable time, heap | Not captured: current browser interface does not expose Performance/CDP measurements |
| Dispatcher, supervisor/team, manager parity | Dispatcher spot checks now recorded below; populated financial parity and supervisor/team/manager sessions remain outstanding |

The two live observations are transient UI structure checks, not reconciled
business row counts or a fixed-filter performance baseline. They include no names,
financial values, credentials, record IDs, HAR, screenshots or raw recordings.
No speedup, financial parity or complete live acceptance is claimed. The default
Playwright browser download failed; browser validation used a pinned temporary
`@sparticuz/chromium@153.0.0` installation from npm with the executable override.
No repository dependencies or lockfiles were changed.

## Follow-up dispatcher checks — 9 October 2026

Secure sign-in verified a separate account with primary role `dispatch`.
The workload label remains `dispatcher`; its visible-role selector in the example
recipe is corrected to `text=/^dispatch$/`, matching the live sidebar and source.
No user roles, assignments or records were changed to obtain the test view.

| View and scope | Observation |
|---|---|
| Analytics, dispatcher-owned, all-time default | No performance table rows; five summary metrics displayed zero |
| Analytics, fixed 21–27 September 2026 week | Same empty rows and five zero summaries |
| Analytics, navigation away/return, same week | Same rows/zero summaries |
| Analytics, reload, same week reapplied | Signed-in role retained; same rows/zero summaries; the week filter resets on reload and was explicitly reapplied |
| Reports, Individual Mode | No rendered tables or body rows in the observed office tab |
| Trips, Individual Mode default | Three visible business loads at the initial observation; this is not a closed-week or financial parity result |
| Trucks / Drivers / Trailers | Each rendered one table with 100 multi-cell body rows on its default first page; these are visible-page counts, not full totals or proof of account-scoped permissions |
| Fleets / Heatmap | Headings loaded; neither used a main-content table in the observed snapshot, so no business count inferred |
| EFS Requests | One rendered table with 10 multi-cell body rows in its default view |
| Oil Change / Mandatory Yard Repair / Pre-trip | Each rendered a table with one single-cell placeholder row; no populated truck/task/form data was validated |
| Load editor | Not validated: an observed Trips edit target no longer matched when the click was attempted; no save or input edits were performed |

These are read-only UI spot checks, not request/byte/time/heap measurements. The
authenticated browser interface still lacks those profiler capabilities. General
page navigation was inspected; multi-form photos, service details, populated debt/
salary/financial totals and realtime reconnect were not validated. Zero Analytics
summaries alongside visible Trips are a recorded difference between workflows,
not proof that the app is wrong or that the account has no assignments.

Individual Mode was restored to its original off state after the checks. No raw
record names, amounts, IDs, email addresses, passwords or session state are saved
in this record. Supervisor/team and manager sessions are still required, together
with a reproducible populated dataset and passive profiling or the standalone
runner in an authorized browser environment. TMS-02 remains Blocked acceptance.

## Repeatable recipe

Use a stable, non-production dataset with the actual role combinations. Keep its
records unchanged between runs. Choose one closed Chicago week (for example
5–11 October 2026), one carrier and the same page filters. The raw Analytics path
remains the reference; record whether the existing precomputed flag is enabled
in private notes. No flag changes are made by the harness.

| Workflow | Visible route | Required reference checks |
|---|---|---|
| Analytics, first | `/analytics` | Dispatcher rows, gross, miles, RPM, cut, salary/debt totals and selected scope |
| Reports | `/reports` | Rows per dispatcher/team; stop/document/assignment indicators |
| Trips | `/trips` | Selected week's rows, totals and paid markers |
| Load editing | `/edit-order/<private-fixture-id>` | Stops, amounts, files, transfers and locked/read-only state; never save |
| Fleet lists | `/drivers`, `/trucks`, `/trailers`, `/fleets` | Status filters, assigned rows and list counts |
| EFS | `/efs-requests` | Selected history view, row count and totals; no money code or card operation |
| Heatmap | `/beverly-heatmap` | Fixed tab/filter, totals and one existing detail selection |
| Maintenance | `/live-oil-change`, `/mandatory-yard-repair` | Due/overdue counts, mileage and warning indicators |
| Service log | `/live-oil-change/<private-fixture-truck-id>` | Existing service rows and mileage values; no inline editing |
| Pre-trip | `/pretrip-inspection` | Fixed week, truck rows, multiple-form identity and separate photo-group counts |

Hidden pages remain excluded. Restrict each scenario's `roles` to users who can
actually access that workflow. Document authorized-denied views separately; a
missing page must not be counted as a fast successful load.

Copy `scripts/benchmarks/recipe.example.json` into `.benchmark-private/recipe.json`.
The example deliberately has `reviewed: false`. Confirm each readiness selector,
row selector, total checkpoint, visible role marker and date/company filter on the
actual view before setting it to true. Set `applicationRevision` to the verified
deployed commit; the local harness commit does not prove what a remote app serves.
Replace all placeholder selectors locally;
the example is not a claim those production selectors or totals were validated.
Add remaining workflow scenarios from the table. For nested edit/service routes,
set `warmLink` to the actual existing read-only navigation control. Multi-step
filters, tabs, nested dialogs and picture checks require a separate documented
manual pass; the runner intentionally cannot click arbitrary form buttons.

The `ready` selector must prove loaded content, not just a header. List loading
selectors in `busy`. `checkpoints` must point at actual total/count values,
including out-of-table summaries, not just their labels. DOM body-row counts are
visible rows only; pagination and virtualization require separate full-result
counts. A stable DOM is a measurement definition, not proof of complete data.

Private signed-in Playwright storage states must be prepared through the normal
authorized sign-in workflow outside this runner. Do not enter passwords in this
script, dump browser credentials, or commit session files. A role label on the
command line is insufficient: the runner also checks the visible role marker.

```sh
npm run test:benchmark
npm run test:benchmark:browser
npm run benchmark:readonly -- .benchmark-private/recipe.json dispatcher .benchmark-private/dispatcher.json benchmark-results/dispatcher.json
```

Use Playwright's installed Chromium normally. If an authorized existing Chromium
binary is supplied, `TMS_BENCHMARK_CHROMIUM=/absolute/path/to/chromium` selects it
for both browser fixtures and the runner; record its version with the results.

Repeat for supervisor/team and manager, twice with exactly the same dataset,
filters, viewport and browser version. An optional fifth argument supplies a
second authorized storage state for an isolated-context session-change sample.
This does **not** test account switching in the same running app; manually verify
sign-out/sign-in, revoked/changed scope and absence of prior-user data as a
separate acceptance check. Never change real users' roles to manufacture evidence.

## Measurement contract and safety limits

- Cold: fresh browser context, JS heap and in-memory query cache; supplied auth
  and any persisted state remain. Record persisted cache state separately.
- Reload: one hard reload in that context.
- Warm: three rounds through existing SPA navigation, preserving the running app.
- Reconnect: one second offline, online, then first-page navigation. Manually
  verify dropped/recovered updates in staging; navigation alone is not proof of
  realtime replay correctness.
- Usable time: navigation through configured readiness/busy checks and a stable
  row/total window (default 1 second); includes that settling window and automation
  overhead. Do not compare it to an unqualified first-contentful-paint number.
- Requests count CDP request events, including redirects and preflight. Transfer
  bytes sum completed requests' encoded lengths in the observation interval;
  in-flight requests are reported separately. Realtime payload bytes and earlier
  redirect bodies are not part of that byte total. Heap is JSHeapUsedSize at each
  interval end; no forced GC, and no claim that one sample proves a memory leak.
- HTTP routing disables the browser HTTP cache. Warm results measure SPA/query
  cache reuse, **not** ordinary browser-cache benefits. Long-lived subscriptions
  remain active; frame counts are observations, not a production billing estimate.
- Only app-origin reads, Data API table reads and the existing `/auth/v1/user`
  read can pass. HTTP mutation methods, RPCs (even GET), Edge Functions, Storage
  downloads, third-party assets and token-refresh POSTs are blocked. Realtime
  allows heartbeat/join/leave only; broadcasts/presence writes are blocked.
  Service workers are blocked to prevent bypassing interception.
- Any blocked request or observed HTTP/network error invalidates that sample.
  Some real pages require read-only RPCs, maps, private photos or token refresh;
  a denied dependency is a limitation, never evidence of faster production.
  Do not broaden the guard simply to get a passing run. Review each necessary
  read's deployed behavior first, or capture that scenario externally with a
  passive browser profiler under a separately documented read-only recipe.
- Output contains counts, byte/time/heap metrics and keyed HMAC fingerprints,
  never raw rows, totals, URLs, headers, bodies or errors. The secret is not
  exported. By default digests compare only within one run. For repeated runs,
  use the same private `TMS_BENCHMARK_DIGEST_KEY`; never publish it. Changed totals
  or row order fail parity even when a page looks faster. Live-data movement must
  be reconciled, not suppressed.
- Browser traces/screenshots/video are disabled; private sessions, recipes and
  measurements are ignored by git. Review even redacted output before sharing.

## Completion and rollback

Remaining acceptance: finish the private selectors/filters; capture all required
roles and visible workflows;
repeat with row/total parity; verify reload, realtime reconnect and in-app session
change; save redacted reference results tied to the measured application revision.
Only then mark TMS-02 Completed. Until then the tracker remains 1/44 completed.

Rollback: revert the commit titled `TMS-02: add read-only workflow benchmark harness`.
Only test tooling, commands, ignores and documentation are removed; no data rollback
or production-source change is involved. Private session state can be deleted
locally after measurement through its ordinary local workflow.
