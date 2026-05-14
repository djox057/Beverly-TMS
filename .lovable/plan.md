## Goal

Finish the half-implemented "driver home location" feature: auto-geocode a driver's home address on add/update, persist `home_latitude`/`home_longitude`, and show a 🏠 marker on the Reports fleet map.

## Current state

- DB columns already exist on `drivers`: `home_address`, `home_city`, `home_state`, `home_latitude`, `home_longitude`.
- `EditDriverDialog.tsx` and `Drivers.tsx` (Add Driver + Edit) write these fields, but `home_latitude`/`home_longitude` are only set via manual text inputs — never auto-geocoded.
- `supabase/functions/calculate-mapbox-route` already supports `{ type: 'geocode', address }` and `src/utils/mapboxRouteCalculator.ts` exports `geocodeAddress(address)`.
- Reports fleet map = `src/components/DispatcherFleetMapDialog.tsx` (renders truck markers + selected pickup/delivery marker). No home marker today.

## Changes

### 1. Geocode helper (new) — `src/utils/geocodeDriverHome.ts`

Single function:
```
geocodeDriverHome({ home_address, home_city, home_state })
  → { lat, lng } | null
```
- Requires at least `home_city` + `home_state`. Returns `null` otherwise.
- Builds query string: `[home_address,] home_city, home_state` (skip address if blank).
- Reuses `geocodeAddress()` from `mapboxRouteCalculator.ts`.
- Swallows errors → returns `null` (so save never fails because of geocoding).

### 2. Add Driver flow — `src/pages/Drivers.tsx` (Add path, ~line 500)

Before the `INSERT`:
- If `home_city` and `home_state` are present, call `geocodeDriverHome(...)` once.
- Use returned `{ lat, lng }` for `home_latitude`/`home_longitude` if user did not manually type values; otherwise prefer manual values (respect explicit input).
- If geocoding returns null, save with `null` lat/lng (no blocking).

### 3. Edit Driver flow — two locations

- `src/components/EditDriverDialog.tsx` (~line 491, the `UPDATE`)
- `src/pages/Drivers.tsx` Edit handler (~line 772)

Logic in both:
- Compare `home_address`/`home_city`/`home_state` against the original loaded values.
- Re-geocode **only if** any of those three changed AND city+state are present AND user did not manually edit lat/lng in this session.
- Track "user manually changed lat/lng" via the existing form inputs (compare current `formData.home_latitude/longitude` to initial values from `driver`).
- If geocoding succeeds → overwrite lat/lng. If it fails → keep previous lat/lng.

This guarantees: geocoding runs **once** per save, and **only** on add or when home address fields actually change.

### 4. Reports fleet map — `src/components/DispatcherFleetMapDialog.tsx`

Extend `TruckData` interface (in this file + at the call site in `Reports.tsx` line 4174):
- Add `homeLatitude?: number | null`, `homeLongitude?: number | null`.

In `useReports.ts`, the home select already includes `home_city, home_state` — extend the selects at lines 889, 1752, 2145 to also pull `home_latitude, home_longitude`, and pass them through to the truck object consumed by the fleet map.

Render in map init loop (alongside truck markers):
- For each truck whose `driver1` has valid `homeLatitude/homeLongitude`, add a small 🏠 marker at those coords. Use a distinct, smaller styled element so it doesn't compete with the truck pin.
- Markers stored in a separate `homeMarkersRef` (cleaned up alongside truck markers).
- Do **not** auto-fitBounds to include homes (would zoom out too far). Only show.

### Out of scope
- No retroactive backfill of existing drivers (geocoding fires only on next add/edit per spec).
- No changes to `TruckMapDialog` (single-truck dialog) unless requested.
- No changes to address parsing logic.

### Validation
- Add new driver with city+state → row has lat/lng populated.
- Edit driver, change only phone → no geocode call (verify via network tab).
- Edit driver, change `home_city` → geocode runs once, lat/lng updated.
- Edit driver, manually type lat/lng → manual values preserved, no overwrite.
- Reports fleet map shows 🏠 markers for drivers with home coords; absent for drivers without.
