## Goal
Make the dispatcher-tier detail page "company avg" RPM match Analytics' "Avg Rate/Mile" (e.g. 3.35 for This Week, 3.30 for June 2026).

## Root cause
The current company query in `src/pages/DispatcherTierDetail.tsx` pulls every order in the date window. Analytics scopes to orders booked by dispatchers in the four offices (KRAGUJEVAC, Čačak, BG 1st floor, BG 4th floor) and also applies the same "include canceled only if TONU > 0" rule. The unscoped query brings in orders booked by people outside those offices (or with no booker), which moves the RPM away from Analytics.

## Fix
In `src/pages/DispatcherTierDetail.tsx`:

1. On load, fetch the list of dispatcher user_ids whose `profiles.office` is in `['KRAGUJEVAC','ČAČAK','BG 1st floor','BG 4th floor']` (use the same office list Analytics defaults to — pulled once from `profiles`, no hardcoding of UUIDs).
2. Change the company-orders query to add `.in('booked_by', officeDispatcherIds)` (and keep the existing `or(...)` date filter and the post-fetch TONU/canceled rule).
3. Keep the existing `analyticsFreight` formula and local-date filtering — they already match Analytics.
4. Leave the dispatcher's own stats and the loads table unchanged.

## Technical notes
- The dispatcher list query: `supabase.from('profiles').select('user_id, office').in('office', [...offices])`.
- Offices list lives once at the top of the file as a constant so it can be adjusted later.
- Company query already selects the fields needed for `analyticsFreight`; just adds the `booked_by` filter.
- No schema changes, no edge functions.

## Verification
After change, on the same week (Jun 22 – Jun 28) the company avg should read `3.35`, and for June 2026 it should read `3.30`, matching the Analytics screenshots.
