
Goal: Fix the Reports “All Users” dropdown so it truly shows all users (including Filip Stevanović- Phillip), while changing only the All Users filter logic.

What I found:
- The current dropdown data source in `src/pages/Reports.tsx` is role-filtered:
  - `profiles` joined with `user_roles!inner(role)`
  - restricted to `["dispatch", "afterhours", "manager", "supervisor", "admin"]`
- This can still hide users because visibility of `user_roles` rows is RLS-dependent by viewer role.
- Also, profile names can contain extra whitespace (e.g. trailing spaces), which can make matching inconsistent.

Implementation plan (only All Users filter area):
1. Update the dropdown query in `Reports.tsx` to fetch from `profiles` only (no `user_roles` join, no role filter):
   - Select: `user_id, full_name, email`
   - Keep this query dedicated to the All Users combobox only.
2. Normalize user display values before building options:
   - Trim `full_name`
   - Fallback to `email` if `full_name` is empty
   - Deduplicate cleanly to avoid repeated entries
3. Keep existing filter behavior untouched:
   - Continue writing selected value into `dispatchNameFilter`
   - Continue existing downstream filtering logic exactly as-is
4. Minor text cleanup in this same filter control only:
   - Change empty text from dispatcher wording to user wording (optional but scoped to this filter)

Technical details:
- File to change: `src/pages/Reports.tsx` (only)
- Replace `allDispatcherProfiles` role-joined query with an “all profiles” query.
- Keep `Combobox` component unchanged globally.
- Keep all non-filter logic (search by load number, office auto-switch, date window, report rendering) unchanged.

Validation checklist:
1. Open Reports → All Users dropdown.
2. Type `Filip` and `Phillip`; confirm `Filip Stevanović- Phillip` appears.
3. Select that user and confirm report filtering still works.
4. Spot-check other roles/users (afterhours, manager, supervisor, admin, and non-dispatch users) appear in dropdown.
5. Confirm no changes in other filters or report behavior.
