# Fix: Reports misses realtime updates when not open

## Problem

The `useOrdersRealtime` hook only runs while `useOrders` is mounted (Orders page, etc.), and even when running, it only patches the `["orders"]` React Query cache. The Reports page uses its own independent queries (`["reports", "priority"]`, `["reports", "full"]`) with a 5-minute `staleTime` and no realtime subscription. Result: if someone creates an order while Reports is closed (or on another tab), Reports doesn't see it until the staleTime expires or the user manually refreshes.

## Fix

Add a small app-level realtime hook mounted once in `AppContent` (App.tsx) — runs for the entire authenticated session regardless of the active route — that listens to `orders`, `pickup_drops`, and `order_transfers` and invalidates the `["reports"]` query family (debounced ~1s to coalesce bursts).

### Changes

1. **New hook `src/hooks/useReportsRealtime.ts`**
   - Subscribes once to `postgres_changes` on `orders`, `pickup_drops`, `order_transfers`.
   - On any event, schedules a debounced (1s) `queryClient.invalidateQueries({ queryKey: ["reports"], exact: false })`.
   - Cleans up channel on unmount.
   - Uses a unique channel name (`reports-realtime-global`) to avoid collision with `useOrdersRealtime`'s `orders-realtime-global`.

2. **`src/App.tsx`**
   - Import and call `useReportsRealtime()` inside `AppContent` alongside `useRealtimeTokenRefresh()`.

### Why this approach

- Doesn't touch the existing `useOrdersRealtime` (Orders page keeps its surgical cache patching).
- Reports already refetches efficiently via its priority/background queries, so invalidation is the simplest correct trigger — no need to manually merge a new order into the complex reports data shape.
- Debounce prevents an avalanche when many related rows change at once (e.g., creating an order with multiple pickup_drops).
- Mounting in `AppContent` (inside `AuthProvider`) ensures the subscription is active whenever the user is logged in, on any route.

### Out of scope

- No changes to `useReports.ts`, `useOrders.ts`, or any UI code.
- No DB / RLS / publication changes (orders/pickup_drops/order_transfers are already in `supabase_realtime`, as evidenced by the working `useOrdersRealtime`).
