## Goal

Make the 🏠 marker + 300‑mile yellow radius show up on the dispatcher fleet map in `/reports` for every driver that has `home_latitude` / `home_longitude` saved.

## Root cause (recap)

`/reports` is fed by `src/hooks/useReportsDateWindowAdapter.ts`, not `useReports.ts`. The adapter loads drivers with `select("*")` (so the home columns are in memory) but never propagates them onto the `truck` objects, so `truck.homeLatitude` / `truck.driver1?.home_latitude` are both `undefined` in `Reports.tsx`, leaving `homeLocations` empty in `DispatcherFleetMapView`.

## Changes

1. **`src/hooks/useReportsDateWindowAdapter.ts`** — when building each truck row for a dispatcher group (the same place `homeAddress`/HOS fields are already attached from `realDriver`), also attach:
   - `homeLatitude:  realDriver?.home_latitude  ?? null`
   - `homeLongitude: realDriver?.home_longitude ?? null`
   - `homeCity:      realDriver?.home_city      ?? null`
   - `homeState:     realDriver?.home_state     ?? null`

   Do this in both code paths that produce truck rows (active drivers and the off‑duty / unassigned reconstruction around line ~2042 where `realDriver` is already in scope), so home pins show up for every driver row the map receives.

2. **`src/pages/Reports.tsx` (~line 4228)** — no logic change needed once (1) lands; the existing `truck.homeLatitude ?? truck.driver1?.home_latitude ?? null` will resolve from the new top‑level field.

3. **Verification**
   - Add a one‑shot `console.debug('[fleet-map] homeLocations', homeLocations.length)` in `DispatcherFleetMapDialog.tsx` while testing, then remove.
   - Open a dispatcher group on `/reports`, expand the fleet map, confirm 🏠 markers + transparent yellow 300‑mile circles appear and the map auto‑fits to include them.

## Out of scope

- No changes to `DispatcherFleetMapDialog.tsx` itself (marker + radius rendering is already correct).
- No changes to `useReports.ts` (not used by this screen; can be cleaned up separately if desired).
- No DB / RLS / migration changes — `home_latitude`/`home_longitude` are already populated by the geocoder on driver add/update.
