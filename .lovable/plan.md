

## Problem

RC files in `/orders` (Reports) popover return HTTP 400 from `createSignedUrl` because the in-memory file cache is stale.

**Confirmed via DB inspection of order `1a7c4522…` (8202-BF):**
- DB `order_files` RC row → `…/RC/doc1750727645.pdf` ✅ (also exists in storage)
- App is requesting → `…/RC/doc1749789069.pdf` ❌ (does not exist in DB or storage)

## Why it happens

`src/hooks/useReportsDateWindowAdapter.ts` keeps a **module-level Map** (`orderFilesCacheByOrderId` + `orderFilesLoadedOrderIds`) of order_files. When a user replaces an RC in Edit Order, the old RC row is hard-deleted and a new one inserted. Cache invalidation relies on **two** mechanisms:

1. `invalidateOrderFilesCacheForOrder(id)` called in EditOrder before navigating back (works for the editor).
2. A realtime subscription on `order_files` (works for everyone else).

The realtime subscription is fragile — if it's not yet `SUBSCRIBED`, the tab was backgrounded, the WebSocket dropped, or the user wasn't on Reports when the RC was swapped from another tab/user, the cache keeps the old `file.file_path` forever. RC is the only category that gets fully replaced (delete-all-then-insert), so it's the only one that misbehaves; BOL/POD/ADDITIONAL are additive.

## Plan

Make the open/download flow self-healing instead of relying solely on realtime.

### 1. Fall back to a fresh DB lookup on signed-URL failure

In `src/pages/Reports.tsx`, in the doc popover click handlers (3 spots: pre-fetch loop, link click, download button — around lines 6469-6580), wrap `createSignedUrl` so that on error or missing object:

- Re-query `order_files` by `file.id` (or by `order_id + file_category` if the row was deleted) directly from Supabase.
- Update the module-level cache (`invalidateOrderFilesCacheForOrder` + force a refetch) and retry `createSignedUrl` with the fresh `file_path`.
- If still failing, show the existing toast.

### 2. Prefer fresh files when opening the RC popover

When the popover for any doc category opens, re-fetch that order's `order_files` from the DB (cheap, single order, indexed) and use the fresh result for both the URL pre-fetch and the rendered list — rather than trusting the cached `zoomedLoad.orderFiles`. Update the cache with the result so the grid stays consistent.

### 3. Apply the same safety net in EditOrder existing-files viewer

`src/pages/EditOrder.tsx` lines 4434 and 4507 also call `createSignedUrl` from local state. They are safer (state is freshly loaded for that order) but can still go stale after another user edits. Add the same "on 400 → re-fetch this file row by id → retry" fallback.

### 4. Optional hardening (low risk)

In `useReportsDateWindowAdapter.ts`, when the realtime subscription transitions to `SUBSCRIBED` (or reconnects), clear `orderFilesLoadedOrderIds` for the visible window so the next read repopulates from DB. This recovers from missed events after WebSocket drops.

### Files to change

- `src/pages/Reports.tsx` — popover open/click/download handlers for RC/BOL/POD/ADDITIONAL.
- `src/pages/EditOrder.tsx` — existing-files Eye buttons (lines ~4434 and ~4507).
- `src/hooks/useReportsDateWindowAdapter.ts` — small helper to refetch a single order's files + reconnect-aware invalidation.

### Out of scope

- No DB migration needed.
- No change to upload/replace logic; the bug is read-side cache staleness.

