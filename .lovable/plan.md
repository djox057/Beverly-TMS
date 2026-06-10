## Goal

Change the Orders search bar so it works in two passes:

1. **Exact match pass** — query the database for orders whose `broker_load_number` OR `internal_load_number` exactly equals the typed term.
2. **Substring fallback** — only if the exact pass returns zero rows, run the existing `ilike '%term%'` query against the same two columns.

This keeps results precise when the user types a full load number (avoiding the current behavior where typing `19251` can return unrelated rows like `251765` or `175851` simply because they contain the digits), while still letting partial typing surface candidates.

## Where the change goes

Single file: `src/hooks/useOrdersSearch.ts`, inside the `searchOrders` callback, replacing the current Stage 1 query block.

No UI changes, no edge-function changes, no schema changes. The debounce, stale-response guard, batch enrichment (pickup_drops / files / transfers / recovery / trucks / drivers / brokers / companies / trailers), `transformOrders`, and `queryClient.setQueryData` flow all remain identical — only the Stage 1 fetch becomes two-step.

## Behavior details

- **Term shape:** `term` is the trimmed lowercase input (existing logic). Both columns are text, so equality is compared as strings; no numeric parsing.
- **Exact filter:** `.or("broker_load_number.eq.<term>,internal_load_number.eq.<term>")` plus the same dispatcher / booked-by-company scoping that the substring query already applies.
  - `internal_load_number` is stored with its frozen suffix (e.g. `10537-BFP`). To make exact match still feel "exact" when the user types only the numeric portion, the exact pass will also match `internal_load_number.ilike.<term>-%` (prefix before the suffix dash). This keeps `19251` matching `19251-BFP` exactly but still excludes `192510-BFP`.
  - `broker_load_number` is matched only as full equality — no prefix variant.
- **Fallback trigger:** only when the exact query returns an empty array (and did not error). Any error short-circuits to the existing error path.
- **Substring pass:** unchanged from today — `broker_load_number.ilike.%term%,internal_load_number.ilike.%term%`, `order by created_at desc limit 100`, same scoping filters.
- **Stale-response guard:** the `latestSearchKeyRef.current !== searchKey` check runs after each of the two awaits, so a newer keystroke still discards results from either pass.
- **Empty result:** if both passes return zero rows, write `[]` to the cache (same as today's "No results" branch) so the grid shows the empty state instead of stale rows.
- **Caching:** results are still written under the single existing query key; consumers don't need to know which pass produced them.

## Technical section

Replace the current Stage 1 block (the one that builds `query` from `searchFilter` and awaits a single `flatOrders` result) with a small helper that builds the same scoped query from a given `filterExpr`, then:

```text
1. exact = await runScopedQuery(
     `broker_load_number.eq.${term},`
   + `internal_load_number.eq.${term},`
   + `internal_load_number.ilike.${term}-%`
   );
2. if exact stale -> return
3. if exact error -> throw (existing catch)
4. flatOrders = exact.length > 0
     ? exact
     : await runScopedQuery(
         `broker_load_number.ilike.%${term}%,`
       + `internal_load_number.ilike.%${term}%`
       );
5. if substring stale -> return
6. continue into existing Stage 2/3 enrichment unchanged
```

`runScopedQuery` encapsulates the dispatcher/booked-by/company scoping currently appended after `.or(searchFilter)` so both passes apply identical filters.

No new dependencies. No new types. The `ORDER_COLUMNS` selection, the `.limit(100)`, and the `order("created_at", desc)` ordering stay the same.

## Out of scope

- The "Searching all orders…" spinner overlap with `useFilteredOrdersSearch` and the `cancelQueries` prefix-cancel issue diagnosed in the previous message are separate bugs; this plan does not touch them. If results still appear stale after this change, that's the next thing to address.
- No change to client-side search (the local filter used when fewer than 2 chars are typed).
- No change to filter dropdowns, date filters, or `useFilteredOrdersSearch`.
