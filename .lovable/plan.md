# Goal

On `/bg-loads`, only load orders whose `booked_by_company_id` = BG Prime from the database. Today the data hook silently ignores the `bookedByCompanyId` key BgLoads passes, so the page fetches the full unlocked + locked dataset (or the dispatcher's slice) and the BG filter is only applied in client-side rendering. `/orders` must remain unchanged.

# Root cause

`BgLoads.tsx` already builds:
```
orderFilterOptions = { bookedBy, dispatcherUserId, bookedByCompanyId: BG_PRIME_COMPANY_ID }
```
and passes it to `useOrdersProgressive`. But the hook's `UseOrdersProgressiveOptions` only knows `bookedBy`, `dispatcherUserId`, `currentPage`, and `excludeBookedByCompanyId`. The `bookedByCompanyId` key is dropped, so:

- The counts query counts every order in the system.
- The per-page edge-function calls (`get-all-unlocked-orders` / `get-all-locked-orders`) fetch every order.
- The filtered-search path (`useFilteredOrdersSearch`) already accepts `companyId`, so once any extra filter is touched it works — the bug is the default no-filter view.

# Scope guarantee — `/orders` is not affected

- `/orders` (`src/pages/Orders.tsx`) never passes `bookedByCompanyId` — it only uses `excludeBookedByCompanyId`. We only **add** a new optional option; existing call sites that don't set it keep current behavior.
- Both edge functions treat the new body field as optional (`null` = no extra `.eq`), so any caller (Orders, sync-google-sheets, etc.) that doesn't pass it is unchanged.
- We do not touch `Orders.tsx`, `useFilteredOrdersSearch.ts`, `useOrders.ts`, or `useOrdersSearch.ts`.

# Fix

## 1. `src/hooks/useOrdersProgressive.ts`

- Add `bookedByCompanyId?: string | null` to `UseOrdersProgressiveOptions`.
- Include it in the `hasFilters` boolean.
- In the counts query and `fetchPage`, when set, apply `.eq("booked_by_company_id", bookedByCompanyId)`. Composes with existing `bookedBy` / `dispatcherDriverIds` / `excludeBookedByCompanyId` clauses.
- Pass `bookedByCompanyId` into both `supabase.functions.invoke("get-all-unlocked-orders", { body })` and `get-all-locked-orders` bodies.
- Include `bookedByCompanyId` in all React Query keys (`orders-counts`, `["orders","page",pageNumber,...]`) and in the `updateOrderLocally` cache write, so `/bg-loads` and `/orders` never share cache.

## 2. Edge functions: `get-all-unlocked-orders` and `get-all-locked-orders`

- Parse optional `bookedByCompanyId` from the request body next to the existing `excludeBookedByCompanyId`.
- In both the count query and the batch fetch loop, when set, add `.eq("booked_by_company_id", bookedByCompanyId)` after the `bookedBy`/`dispatcherDriverIds` block.
- No change to default behavior when the field is absent.

## 3. `src/pages/BgLoads.tsx`

- No edits expected. It already passes `bookedByCompanyId` to the progressive hook and `companyId: BG_PRIME_COMPANY_ID` into `useFilteredOrdersSearch` via its `serverFilters` builder. If a quick re-read of the `serverFilters` block shows `companyId` isn't already injected on the filtered path, add it there — single line.

## 4. Verification

- Open `/bg-loads` with no other filter. Network: `get-all-unlocked-orders` and `get-all-locked-orders` bodies must include `bookedByCompanyId: "238a7acf-cbb5-4718-be7a-130d8d971a90"`. Pagination total must equal BG Prime load count, not global count.
- Apply a date filter on `/bg-loads`. Network: `search-orders` body must include `companyId: "238a7acf-…"` and `orders-summary` totals must match.
- Open `/orders`. Network: same calls fire with **no** `bookedByCompanyId` field; counts and pages must match the pre-change behavior (full dataset minus BG Prime via `excludeBookedByCompanyId`).

# Files touched

- `src/hooks/useOrdersProgressive.ts`
- `supabase/functions/get-all-unlocked-orders/index.ts`
- `supabase/functions/get-all-locked-orders/index.ts`
- `src/pages/BgLoads.tsx` — only if its `serverFilters` doesn't already set `companyId`; otherwise untouched.

# Out of scope

- Any change to `/orders` or shared orders hooks beyond the additive `bookedByCompanyId` option.
- Refactoring the three-path orders data layer.
- UI changes on `/bg-loads`.
