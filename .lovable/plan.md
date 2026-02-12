## Problem

When you mark an order as "paid" on the Trips page, the change saves to the database but the UI doesn't reflect it until you refresh. This happens because the `paid` column (and `invoiced`) are **missing from the column lists** used to fetch orders, so:

1. The initial data load via Edge Functions never includes `paid`
2. When realtime detects the change and re-fetches the order, it also omits `paid`
3. The result: `paid` is always `undefined` in the cache, so the checkbox never appears checked

Additionally, the current save logic uses `invalidateQueries` which, combined with `staleTime: Infinity`, doesn't trigger a proper refresh.

## Fix

Add the missing `paid` and `invoiced` columns to all three ORDER_COLUMNS definitions, and switch the paid toggle to use an optimistic cache update instead of invalidation.

### Changes

**1. Edge Function: `supabase/functions/get-all-unlocked-orders/index.ts**`

- Add `paid, invoiced` to the `ORDER_COLUMNS` constant (after `booked_by`)

**2. Edge Function: `supabase/functions/get-all-locked-orders/index.ts**`

- Add `paid, invoiced` to the `ORDER_COLUMNS` constant (after `booked_by`)

**3. `src/hooks/useOrdersRealtime.ts**`

- Add `paid, invoiced` to the `ORDER_COLUMNS` constant (after `booked_by`)

**4. `src/pages/Trips.tsx` -- `confirmOrderPaidToggle` function (~line 691-712)**

- After the successful `supabase.update()`, apply an optimistic cache patch using `queryClient.setQueryData` on all `["orders"]` caches (non-exact matching) to flip the `paid` field on the matching order
- Remove the `queryClient.invalidateQueries({ queryKey: ["orders"] })` call, since realtime will handle the definitive update

**5. Deploy edge functions**

- Redeploy `get-all-unlocked-orders` and `get-all-locked-orders`