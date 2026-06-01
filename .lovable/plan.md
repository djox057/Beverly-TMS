## Goal

Give the `recruiting` and `claims` roles read access to Trucks, Trailers, Drivers (and their files) at the same permission level as `dispatch`, with tailored sidebar navigation.

## Sidebar navigation (`src/components/Sidebar.tsx`)

Add explicit branches in `getFilteredNavigation()`:

- **`recruiting`** sees:
  - Trucks, Trailers, Drivers
  - Fleets, Reports
  - Truck Sales (already wired)
  - Hides: New Load, Loads, BG Loads, and everything else
- **`claims`** sees only:
  - Loads, BG Loads
  - Trucks, Trailers, Drivers

Also remove `recruiting` / `claims` from any unintended branches (e.g. they currently fall through to `filteredNav` and would see Brokers/Fleets/Reports/Analytics/etc.). The new explicit branches replace that fallback.

## File access (Truck/Trailer/Driver file managers)

File managers gate by `hasRole('dispatch')` etc. for upload/delete buttons. Extend the read-side checks (and any view-files gates) to include `recruiting` and `claims`. Upload/delete stays restricted to existing roles — task says "see them and access their files", interpreted as view + download, matching what `dispatch` can do on the read path.

Files audited:
- `src/components/TruckFilesManager.tsx`
- `src/components/TrailerFilesManager.tsx`
- `src/components/DriverFilesManager.tsx`
- `src/pages/Drivers.tsx`, `src/pages/Trucks.tsx`, `src/pages/Trailers.tsx` — confirm no route-level role gate excludes them (currently none do).

## hasRole helper (`src/hooks/useAuth.ts`)

`dispatch` only matches itself today, so no change needed there. `recruiting` and `claims` will continue to match exactly. No privilege escalation is added — only sidebar visibility and file-manager visibility gates are widened.

## Out of scope

- No DB / RLS changes. Existing policies for `trucks`, `trailers`, `drivers` and storage already allow authenticated reads; if a specific RLS rule turns out to gate by role, I'll surface it during build and propose a migration.
- No edit/create/delete capabilities granted to `recruiting` or `claims`.
- The existing `Truck Sales` access for `recruiting` remains.

## Verification

- Sign-in simulations per role (sidebar snapshot) — confirm visible items match spec.
- Open Drivers/Trucks/Trailers as each role, open a record's Files tab, confirm list + download work and upload/delete buttons remain hidden.