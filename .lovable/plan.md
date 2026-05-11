# Fix: Load# search "58899" wrongly shows offices that have load 7588996

## Root cause

When you search `58899`, both the DB RPC (`lookup_load_office`) and the local in-memory matcher use **substring** matching (`ILIKE '%58899%'` / `.includes("58899")`). So:

- KRAGUJEVAC has broker `58899` → correct match.
- BG 4th floor has broker `7588996` → false positive (contains "58899" as substring).

That's why the multi-office popup shows both. BG 4th floor doesn't actually have load 58899.

## Fix (load# filter only — purely numeric searches)

When the search term is **purely digits**, prefer exact / boundary matches over substring matches. If any office has an exact match, only return those offices. If no office has an exact match, fall back to current substring behavior.

### Changes

**1. New migration — update `lookup_load_office` RPC**

Rewrite the function so for numeric terms it returns an "exact-match-preferred" result:

```text
matched_orders = orders where
  broker_load_number = p_term
  OR (numeric & internal_load_number starts with p_term + '-')   -- e.g. 14457-AP
  OR broker_load_number ILIKE '%term%'      -- substring fallback
  OR (numeric & internal_load_number ILIKE 'term%')
```

Tag each row with `match_rank` (1 = exact broker / internal-prefix-with-dash, 2 = substring).
After grouping by office, if ANY office has rank-1 rows, drop offices that only have rank-2 rows. Otherwise return all.

For non-numeric terms keep current substring behavior (no change in feel).

**2. `src/hooks/useAutoSwitchOffice.ts`**

Apply the same "prefer exact" rule in two places used for the load# filter:
- `findInAllLoadedData` (case `"load"`) — when term is numeric and at least one office has an exact `broker_load_number === term` (or `internal_load_number` starts with `term + "-"`), restrict matching to those exact-match offices.
- `hasLocalMatch` (case `"load"`) — same rule for the current-tab match check.

No change to truck/dispatch search paths. No change to debounce or the parallel local/DB race added previously.

## Files

- `supabase/migrations/<new>.sql` — new RPC version with exact-match-preferred logic.
- `src/hooks/useAutoSwitchOffice.ts` — update the two `case "load"` matchers.

## Validation

- Search `58899` → only KRAGUJEVAC (no BG 4th floor).
- Search `14457` → resolves the office of internal `14457-AP`.
- Search a non-existent number → still resolves to `not_found`.
- Search a partial number that has no exact match anywhere → falls back to substring like today.
- Truck/driver/dispatch searches unchanged.
