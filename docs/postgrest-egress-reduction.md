# Reports database-egress reduction

This change targets the PostgREST responses that dominate the supplied 8 September 2026 Usage screenshot: 56.869 GB / 91.5% of that day's displayed egress. The period total is 1,338.48 GB; the daily percentage must not be extrapolated to the entire period.

## Changes

- Reports no longer mounts the full enriched driver list for its editor. Opening Edit Driver requests the selected record; closing it removes the observer. The existing edit form remains in use.
- All Problems mounts its data consumers only while open. Driver names are retrieved for the problem IDs in batches of at most 100, using only id/name.
- Report driver and truck queries select the fields consumed by normal, team, and off-duty rows, including HOS, contact fields, maintenance alerts, assignments, and telemetry fallback values.
- A successful fleet-list query invalidates report dependencies only if selected report fields changed. Row order, object identity, query lifecycle events, and unrelated fields do not trigger new report downloads. Only the changed dataset is invalidated; batches flush within one second rather than waiting indefinitely for a quiet period.
- Truck refresh is explicitly scheduled every 60 seconds while the query is active and the browser is focused under the existing React Query defaults. This preserves the cadence previously supplied indirectly by the removed driver-list fallback. The driver interval remains 60 seconds.
- Successful editor operations explicitly refresh the report driver/truck queries, preserving updates after assignment, active-state, and profile edits.

No schema, RLS, integration schedule, Analytics, or realtime publication changes are included.

## Measured payloads

Read-only aggregate measurements against FleetCarrier at 18:23:14 UTC on 8 September 2026:

| Active dataset | All-column row JSON | Selected report row JSON | Reduction |
|---|---:|---:|---:|
| Drivers | 681,357 bytes | 434,964 bytes | 36.2% |
| Trucks | 683,365 bytes | 329,207 bytes | 51.8% |

These compare serialized row payloads, not compressed/billed network transfer. They exclude savings from removing Reports' recurring full-driver-list and supporting lookup downloads. They are not a forecast of whole-project savings.

The earlier 86% HOS-only projection is not implemented here: this patch retains all fields the visible report needs and its current refresh cadence.

## Verification

- Six focused regression tests pass: closed dialogs perform no work; editing fetches one ID and refreshes report dependencies after save; failed loads are retryable; focus does not replace unsaved form values; unchanged lists do not trigger refreshes; HOS/assignment/deletion changes target the correct dataset; errors do not imply deletion.
- TypeScript checks pass.
- Production build passes, with the existing large-bundle warnings.
- Both projections execute successfully against the live schema using aggregate queries only.
- No production UI writes or deployment were performed.

## Rollout checks

Before broad rollout, verify with an authorized staff session:

1. Keep Reports open with dialogs closed: there should be no recurring unfiltered, name-sorted full-driver query caused by Reports.
2. Open a driver editor, modify a field and save; verify the correct driver and any truck assignment update in Reports. Closing and reopening should load current details.
3. Open/close All Problems and confirm names, resolve flow, empty history, and load-error recovery.
4. Check normal, team, off-duty, cross-office, HOS, OOS, fuel/distance, maintenance, and driver alert fields.
5. Compare browser response bytes and project PostgREST egress per active hour after clients receive the new deployment. The accumulated billing-cycle total will not decrease retroactively.

Remaining larger work: shared order-change fetching, narrower data loading on other pages, separating HOS from master-record traffic, and Analytics (currently marked deferred in the project roadmap).

