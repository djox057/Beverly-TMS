## Goal

Make the Orders page search bar behave exactly like the Reports "search by load number" filter — a pure substring match on load numbers, no other fields.

## How Reports does it (reference)

`src/pages/Reports.tsx` → `orderMatchesLoadFilter`:
- Substring match (case-insensitive) on:
  - `broker_load_number`
  - `internal_load_number` (raw value)
  - `formatInternalLoadNumber(internal_load_number, companyName)` (formatted with company suffix, e.g. `18707-AP`)
- 200 ms debounce, 3-char minimum (`searchTerm.length >= 3`).
- Persists to localStorage so the value sticks across reloads.
- Visual feedback: input gets a red border + "Load not found" hint when length ≥ 3 and no results.

## Changes to Orders

### 1. DB function: simplify `search_orders_ids` to plain substring
- Drop the exact-match / substring-fallback split.
- Always run:
  ```
  WHERE o.broker_load_number ILIKE '%term%'
     OR o.internal_load_number ILIKE '%term%'
  ```
- Keep the scope filters (`p_booked_by`, `p_dispatcher_user_id`, `p_excluded_booked_by_company_id`, `p_booked_by_company_id`) and `p_limit`.
- Allow numeric-only terms (no `!~ '^\d+$'` gate) — matches Reports.
- Indexes from the previous migration (trigram GIN on both columns) already make this index-backed.
- `search_orders_hydrate(uuid[])` stays unchanged.

### 2. Frontend: `src/hooks/useOrdersSearch.ts`
- No behavior change inside the hook — it already calls ids→hydrate. It just naturally gets the new substring-everywhere semantics from the DB function.

### 3. Frontend: `src/pages/Orders.tsx`
- Bump the activation threshold from 2 → **3 chars** to match Reports.
- Raise debounce 150 ms → **200 ms** to match Reports.
- Persist `searchTerm` to `localStorage` under `orders-loadNumberFilter` (read on mount, write on change), matching Reports' `reports-loadNumberFilter`.
- Replace the multi-field client-side fallback filter (truck #, driver name, broker name, etc.) with a single load-number substring matcher that mirrors `orderMatchesLoadFilter`. This is only used as a fast pre-server visual filter while the RPC is in flight.
- Add Reports-style visual feedback on the search input:
  - When `searchTerm.length >= 3` and the server returned 0 rows and `isSearching === false`, apply `border-red-400` and show a small "Load not found" hint below the input.
- Remove the Enter-to-search keydown handler (Reports doesn't need it — 200 ms debounce + always-substring is fast enough). Optional: keep it as a "search now" shortcut. Default is **remove** for parity.

### Files touched

- New migration: redefine `public.search_orders_ids` (substring-only, no numeric gate).
- `src/pages/Orders.tsx`: threshold, debounce, localStorage, client matcher, red-border hint, drop Enter handler.
- `src/hooks/useOrdersSearch.ts`: change the `< 2` guard to `< 3` so a short term clears state consistently.

### Expected behavior

Typing `18707` or `robinson` or `555330896` in the Orders search field now finds every load whose broker or internal load number contains that substring, full-stop — identical to Reports. No truck, driver, or broker name matching, no exact-first preference, no numeric-only short-circuit.
