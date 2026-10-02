Supervisor access rollout
=========================

The frontend, migration `20261002193703_supervisor_dispatch_parity.sql`, and four Edge Functions belong to one rollout. Frontend filtering alone does not enforce database access.

1. Deploy `get-all-unlocked-orders`, `get-all-locked-orders`, `search-orders`, and `orders-summary` with `_shared/supervisorAccess.ts`. Preserve the existing custom authentication and `verify_jwt=false` configuration. Each endpoint validates the caller with `auth.getUser()` before choosing the RLS client.
2. Apply the migration through Supabase migrations.
3. Publish the frontend from the same commit.
4. Check a supervisor account with two assigned dispatchers: own and assigned loads/trips/performance should be visible; an unassigned dispatcher in the same office should be excluded. Repeat search, filtered search, pagination, totals, locked loads, and exports. Remove an assignment and verify refreshed scope. An account with no assignments should see its own data.
5. Compare supervisor and dispatcher navigation and edit restrictions. Verify that Low Stop Amount approval is still required for dispatch/afterhours and is exempt for supervisors. Verify that only the supervisor's own salary is shown.
6. Check Supabase security/performance advisors and query timings for counts and locked-order requests.

The database migration is prepared against the live policy/function definitions. It has not yet been applied or exercised against production identities. Frontend type checking, production build, and 44 focused permission/navigation/server-scope tests passed before review.

To revert, apply `supervisor_dispatch_parity.sql` in this directory as a rollback migration and restore the previous frontend and four Edge Functions. The rollback restores the captured pre-change function definitions and policies; it does not alter user role records or dispatcher assignments.
