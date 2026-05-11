## Problem

When you type a load# that lives in an office that isn't currently loaded, the spinner sits on the current office for ~1–2 seconds before switching. Once it switches, the loaded office renders instantly. Searching for a load that lives in the currently loaded office is already fast and must stay that way.

The slow path is in `src/hooks/useAutoSwitchOffice.ts` → `lookupLoadOffice()`. It runs **three sequential round trips** to Supabase:

```text
orders (broker_load_number ilike) ─► driver1_id list
                  │
                  ▼ (await)
            orders (internal_load_number ilike)  ─► more driver1_id
                  │
                  ▼ (await)
            drivers.in(driver1_ids) ─► dispatcher_id list
                  │
                  ▼ (await)
            profiles.in(dispatcher_ids) ─► office
```

Each `await` adds a Supabase round trip (~150–400 ms). With debounce + 3–4 hops + tab-switch render, that's the perceived "spinning on the wrong office".

There is no real retry loop — the existing local cache (`localMatchFoundRef`, `lastSearchedTermsRef`, `findInAllLoadedData`) already prevents repeats. The fix is purely about cutting hops.

## Fix (load# only — do not touch truck/dispatch search)

### 1. Collapse the load# DB lookup to a single joined query

Replace the 3-hop chain in `lookupLoadOffice` with one Postgres-side nested select that returns the office in one round trip:

```ts
supabase
  .from("orders")
  .select(`
    locked,
    canceled,
    pickup_datetime,
    driver1_id,
    drivers!inner (
      dispatcher_id,
      profiles:profiles!drivers_dispatcher_id_fkey ( office )
    )
  `)
  .or(`broker_load_number.ilike.%${term}%,internal_load_number.ilike.${numericPart}%`)
  .not("driver1_id", "is", null)
  .limit(10);
```

(If the FK relationship hint name differs we'll resolve via `supabase__read_query` against `pg_constraint` while implementing.)

This drops 3 round trips to 1. Same data, same logic for `isLocked` / `isCanceled` / `pickupDate` / `driverId` / ambiguous-office detection — just extracted from the joined rows instead of fetched separately.

### 2. Run the DB lookup in parallel with the local scan

Currently the effect does, in order:
1. `hasLocalMatch` (current tab only) → if hit, stop.
2. `findInAllLoadedData` (every loaded office) → if hit, switch tab, stop.
3. DB lookup.

For load# (and only load#), step 2 iterates every order in every loaded office on the main thread. When the load lives in an unloaded office, that scan is pure waste before the network call even starts. Change the load# effect to:

1. Run `hasLocalMatch` (cheap — current tab only).
2. If miss, kick off `lookupLoadOffice` immediately AND `findInAllLoadedData` in parallel.
3. Whichever resolves first with a target office wins; the other is ignored.

This means in the bad case (load not in any loaded office), the network request starts ~one tick after typing instead of after the full multi-office JS scan. In the good case (load is in current/loaded office), local match still wins instantly — current fast behavior is preserved.

### 3. Lower load# debounce from 300 ms → 200 ms

In `src/pages/Reports/useReportsFilters.ts`, the `loadNumberFilter` is debounced at 300 ms alongside the other two. Drop just `debouncedLoadNumberFilter` to 200 ms. Truck/dispatch debounce stays at 300 ms (they're typed character-by-character; load numbers are usually pasted, so we can react sooner without thrash).

## What stays the same

- All existing guards: `userOverrideRef`, `manualTabSwitchRef`, `localMatchFoundRef`, `lastAutoSwitchRef`, `lastSearchedTermsRef`, 2000 ms cooldown, circuit breaker.
- "Search ALL orders including locked and canceled, no date filter" rule for load lookup.
- `setSpotlightDriverId` behavior so the matched driver row appears immediately after the tab switches.
- Truck/Driver and Dispatcher search paths — untouched.
- Current fast in-tab search behavior — untouched (local check still runs first).

## Files to edit

- `src/hooks/useAutoSwitchOffice.ts` — rewrite `lookupLoadOffice`; restructure the load-number effect to race local-cross-office scan against the DB call.
- `src/pages/Reports/useReportsFilters.ts` — change `useDebounce(loadNumberFilter, 300)` → `200`.

## Validation

After implementing, on `/reports`:
- Search a load# in current loaded office → still instant (local hit).
- Search a load# in another **loaded** office → still instant (cross-office local hit).
- Search a load# in an **unloaded** office → noticeably faster: spinner ≤ ~400 ms before tab switches, then renders.
- Search a non-existent load# → `not_found` shown, no infinite retries (verify no repeated network requests in DevTools Network tab while the input value is unchanged).
