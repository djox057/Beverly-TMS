
Root cause (why you see no users):
- This is not an RLS visibility issue; your policies for `afterhours_schedule` and `profiles` allow authenticated reads.
- `afterhours_schedule` currently contains orphaned rows with `user_id = NULL` (24 rows).
- In `AfterhoursScheduleDialog.fetchExistingSchedules`, the code builds `userIds` from all schedule rows and sends `.in("user_id", userIds)` to `profiles` and `user_roles` without filtering null IDs or checking query errors.
- When that query fails/returns unusable data, every `schedule.user` becomes `undefined`, and the UI grouping logic skips all office sections (`KG/CA/BG`), so the date looks empty even though schedule rows exist.

Implementation plan:
1) Harden schedule data fetch in `src/components/AfterhoursScheduleDialog.tsx`
- In `fetchExistingSchedules`, split IDs into valid UUIDs only (`filter(Boolean)`), and skip profile/role fetch if the list is empty.
- Add explicit error handling for profile/role lookups (fail gracefully instead of silently producing empty UI).
- Build a `profilesById` map for reliable matching and avoid repeated `.find()` calls.

2) Make rendering resilient to bad rows (no layout changes for normal data)
- Keep existing KG/CA/BG sections exactly as-is for valid office users.
- Add a fallback bucket only when needed:
  - `missingProfile` (deleted/orphaned user rows)
  - `noOffice` (profile exists but office is null/unrecognized)
- Render these only if they exist, so normal weekends look unchanged.

3) One-time data cleanup migration
- Remove truly orphaned schedule rows:
  - `DELETE FROM public.afterhours_schedule WHERE user_id IS NULL;`
- (Optional safe extension) also remove rows where `user_id` no longer exists in `profiles` to avoid future ghost records.

4) Verification checklist
- Test dates with known data (e.g., Mar 7 and Mar 28) and confirm users appear under office sections.
- Confirm past dates still display records read-only.
- Confirm extra-days sidebar still computes correctly.
- Confirm adding/removing schedule entries still works.

Technical details:
- File to update: `src/components/AfterhoursScheduleDialog.tsx`
  - `fetchExistingSchedules` (null-safe ID extraction + error handling)
  - office grouping reducer (fallback buckets)
- DB cleanup: new migration in `supabase/migrations/` for orphan rows
- This fix is backward-compatible and does not alter the standard weekend schedule UI when data is clean.
