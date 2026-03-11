
Goal
- Fix the “All Users” dropdown so it is not limited to dispatch-booked names and can include users from all roles.

What I found
- On `/orders`, the “All Users” combobox currently uses:
  - `uniqueBookedBy = [...new Set(currentPageOrdersFromHook?.map(order => order.bookedBy))]`
- That means options are built only from visible/current loaded orders, not from all users.
- In practice this skews heavily toward dispatch users, which matches what you’re seeing.

Implementation plan (scope: only All Users filter)
1. Update only `src/pages/Orders.tsx` for the “All Users” filter data source.
2. Add a dedicated query for user options:
   - Fetch from `profiles` (not from currently loaded orders).
   - Select only fields needed for display/filter value (`full_name`, optional `email` fallback).
   - Keep this query isolated to the Users filter only.
3. Build normalized combobox options from profiles:
   - Trim whitespace in names.
   - Fallback to email if name is missing.
   - Deduplicate and sort.
4. Wire the existing “All Users” combobox to use these profile-based options instead of `uniqueBookedBy`.
5. Keep all existing filter behavior untouched:
   - Still writes to `bookedByFilter`.
   - Still uses current server/client filtering flow.
   - No other filter controls or business logic changed.

Technical details
- File changed: `src/pages/Orders.tsx` only.
- Replace options source for:
  - `placeholder="All Users"` combobox
- Add `useQuery` fetch:
  - `supabase.from("profiles").select("full_name,email").order("full_name")`
- Keep sentinel option:
  - `{ value: "all-users", label: "All Users" }`
- Preserve all non-Users filters and table rendering as-is.

Validation checklist
1. Open Orders page → open “All Users” filter.
2. Search `Filip` / `Phillip` and confirm non-dispatch roles are selectable.
3. Verify dispatch-only options are still present.
4. Select one user and confirm filtering still executes normally.
5. Confirm no regressions in other filters (Truck, Company, Broker, dates).
