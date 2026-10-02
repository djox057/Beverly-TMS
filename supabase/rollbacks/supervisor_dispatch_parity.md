Supervisor access rollout
=========================

The frontend, migration `20261002193703_supervisor_dispatch_parity.sql`, and four Edge Functions belong to one rollout. Frontend filtering alone does not enforce database access.

1. Deploy `get-all-unlocked-orders`, `get-all-locked-orders`, `search-orders`, and `orders-summary` with `_shared/supervisorAccess.ts`. Preserve the existing custom authentication and `verify_jwt=false` configuration. Each endpoint validates the caller with `auth.getUser()` before choosing the RLS client.
2. Apply `20261002193703_supervisor_dispatch_parity.sql` and `20261002200259_supervisor_scope_cached_lookups.sql` through Supabase migrations. The follow-up keeps team lookups cached per statement.
3. Publish the frontend from the same commit.
4. Check a supervisor account with two assigned dispatchers: own and assigned loads/trips/performance should be visible; an unassigned dispatcher in the same office should be excluded. Repeat search, filtered search, pagination, totals, locked loads, and exports. Remove an assignment and verify refreshed scope. An account with no assignments should see its own data.
5. Compare supervisor and dispatcher navigation and edit restrictions. Verify that Low Stop Amount approval is still required for dispatch/afterhours and is exempt for supervisors. Verify that only the supervisor's own salary is shown.
6. Check Supabase security/performance advisors and query timings for counts and locked-order requests.

Validation completed: both migrations were applied and all four Edge Functions were deployed. Frontend type checking, production build, and 45 focused tests passed, including exhaustive permission parity for all 4,096 combinations of non-supervisor roles. All 2,613 database role checks for 201 non-supervisor accounts matched the pre-change results. Live order access and effective roles matched for representative admin, manager, dispatch, afterhours, accounting, safety, maintenance, and driver identities. An assigned-team test inside a rolled-back transaction returned exactly 808 permitted orders and a matching search result, with count/search completing in about 0.22 seconds. No dispatcher assignments or user role records were retained by testing.

To revert, apply `supervisor_dispatch_parity.sql` in this directory as a rollback migration and restore the previous frontend and four Edge Functions. The rollback restores the captured pre-change function definitions and policies; it does not alter user role records or dispatcher assignments.
