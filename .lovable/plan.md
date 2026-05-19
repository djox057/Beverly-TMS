## Goal
Fix proximity address search in Reports incorrectly resolving "Centerville, MO" to Centerville, OH (Montgomery County). The edge function passes the raw string to Mapbox with `limit=1`, so the top fuzzy match wins regardless of the user-typed state.

## Root cause
`supabase/functions/calculate-mapbox-route/index.ts` → `geocodeAddress` requests only one result and never enforces the state the user typed. Mapbox sometimes ranks an out-of-state match higher when the city name is common.

## Fix (edge function only)
Edit `supabase/functions/calculate-mapbox-route/index.ts`:

1. Detect a trailing US state code in the input:
   - Regex on `City, ST` and `City ST` (end of string), validated against the 50 states + DC/PR set.
2. Change the geocode request:
   - `limit=5` instead of `limit=1`.
   - Keep `country=US`; add `types=place,locality,region,postcode` to bias toward city-level results.
3. When a state code was detected, pick the first feature whose `context[]` includes an entry with `short_code === "US-<ST>"` (case-insensitive). Fall back to `features[0]` only when no feature matches.
4. Log which feature was chosen and whether the state filter matched.

No frontend changes. No change for inputs without a trailing state code (e.g. full street addresses, ZIPs).

## Verification
- `Centerville, MO` → returns coords inside Missouri.
- `Centerville, OH` → still returns Centerville, OH.
- Existing flows (full-street geocoding for routes, DH miles, loaded miles) unaffected because their inputs don't end in a bare state code, and the fallback path is unchanged.
