## Problem

On the New Order page, clicking **Create Load** sometimes shows a generic red toast: **"Error Creating Order — Failed to fetch"**. The email/load confirmation completes fine, but the submit fails with no hint of which step broke.

"Failed to fetch" is the browser's generic `TypeError` from the underlying `fetch` call. It usually means a transient network blip, a dropped connection, or a request that timed out — not a Supabase/business‑logic error. In the current submit flow, `handleSubmit` makes ~10+ sequential network calls (RPC, multiple `orders.update`, `pickup_drops` insert, Mapbox geocode, storage uploads, `order_files` inserts, more updates). Any one of them failing throws this opaque message and we have no idea which.

## Goal

Two changes, scoped to `src/pages/NewOrder.tsx`:

1. **Make the error actionable** — when something throws "Failed to fetch" during submit, the toast must say which step failed (RPC, pickup/drop insert, file upload of `<name>`, geocode, etc.) so the user (and we) can tell whether it's safe to retry.
2. **Auto‑retry transient network blips** — for the safe, idempotent step(s) most likely to cause this (the RPC call is already guarded by `client_request_id`; storage uploads and follow‑up updates are retry‑safe), retry once after a short delay on `TypeError: Failed to fetch` before bubbling the error up.

No DB schema changes. No business‑logic changes. No change to what gets saved.

## Plan

### 1. Add a tiny helper at the top of the submit flow

A local `withFetchRetry(label, fn)` helper that:
- Runs `fn()`.
- If it throws a `TypeError` whose message contains `Failed to fetch` (or `NetworkError`), waits ~600 ms and retries once.
- If the retry also fails, rethrows a new `Error("[<label>] Failed to fetch — network issue. Please retry.")` so the toast pinpoints the step.
- Any non‑network error is rethrown unchanged so we don't mask real validation/DB errors.

### 2. Wrap the network calls in `handleSubmit` (lines ~2005–2248)

Wrap these calls with `withFetchRetry`, each with a descriptive label:
- `supabase.rpc("create_order_with_unique_load_number", ...)` → label `"Create order"`
- `supabase.from("orders").update({ weight_rc })` → `"Save RC weight"`
- `supabase.from("orders").update({ notes })` → `"Save note"`
- `geocodeAddress(...)` inside the pickup/drop mapper → `"Geocode <address>"` (already tolerant of failure — just wrap so the message is clear)
- `supabase.from("pickup_drops").select(...)` existence check → `"Verify stops"`
- `supabase.from("pickup_drops").insert(...)` → `"Save pickup/delivery stops"`
- `uploadOrderFilePreserveName(...)` → `"Upload <category> file: <fileName>"`
- `supabase.from("order_files").insert(...)` → `"Record <category> file"`
- The follow‑up `pickup_drops`/`orders.status` updates after BOL/POD upload → `"Update stop checkout times"` / `"Mark delivered"`

### 3. Update the catch block (lines ~2314–2330)

Keep the existing toast structure, but stop misclassifying `"Failed to fetch"` as a pickup/delivery error. The string match on `"delivery"`/`"pickup"` is fine when those words are part of the real error, but our wrapper messages will include the step label so the user sees, e.g.:

> Error Creating Order
> [Upload BOL file: scan‑123.pdf] Failed to fetch — network issue. Please retry.

instead of just "Failed to fetch".

### 4. Leave intact

- The `client_request_id` idempotency guard on the RPC (it's what makes retrying the RPC safe).
- The "skip pickup_drops insert if rows already exist" guard.
- Orphan‑order cleanup on pickup_drops failure.
- All validation, geocoding fallbacks, and the success/reset flow.

## Files

- `src/pages/NewOrder.tsx` — add helper, wrap calls, refine catch block.

## Verification

- Trigger Create Load with the network online → still succeeds, no behavior change.
- Throttle the network in DevTools (Offline for a moment, then back online) → toast now shows the specific failing step; retrying the submit succeeds because of the idempotency key.
- A real validation error (e.g. missing driver company) still surfaces with its existing message — unchanged.
