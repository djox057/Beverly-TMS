## Problem

When creating a new order, the UI sometimes shows "Failed to fetch" even though the order is fully saved on the server. This is a network/timeout error on the client where the request actually reached Supabase and the RPC committed, but the response never made it back to the browser.

The good news: `create_order_with_unique_load_number` is already idempotent — it locks per `company_id` and dedupes on `(company_id, client_request_id)`. The client already generates `clientRequestIdRef.current` once and reuses it. So retrying the exact same call returns the same order id and internal load number instead of creating a duplicate.

What's missing is the actual retry. Today, the moment the fetch throws `TypeError: Failed to fetch`, we go straight into the `catch` block and toast an error — even though the order is safely in the DB.

## Plan

Add transparent retry-on-network-error to the order submit flow in `src/pages/NewOrder.tsx`.

1. Add a small helper inside `handleSubmit` (or co-located in the file) that detects "transient" network failures and retries:
  - Triggers on: `TypeError` whose message includes "Failed to fetch" / "NetworkError" / "network", or Supabase errors with no `code` and a network-style message.
  - Up to 3 attempts, with short backoff (e.g. 400ms, 1200ms).
  - Keeps `clientRequestIdRef.current` unchanged across retries so the RPC dedupes correctly.
2. Wrap the `supabase.rpc("create_order_with_unique_load_number", ...)` call with this helper. On a retried success, log it (`console.info("↩️ RPC retry succeeded after network blip")`) so it's visible in the console but invisible to the user.
3. Wrap the follow-up `supabase.from("pickup_drops").insert(...)` with the same helper. The existing "skip if rows already exist for this order_id" guard at lines 2084–2096 already makes this safe to retry.
4. Leave business-logic errors (RLS violations, validation errors, RPC exceptions like `unique_violation` that aren't the idempotency case, etc.) untouched — they should still surface immediately as toasts.
5. Verify the existing toast wording for the non-retryable case so users still see a meaningful message when something truly fails after all retries.

## Out of scope

- No DB / RPC changes — the server side is already correct (advisory lock + idempotency key).
- No change to duplicate-stop / missing-data dialogs or to file-upload error handling beyond what's described above.
- No change to other forms that call other RPCs.

## Why this fixes it

The "Failed to fetch" message is purely a client-side symptom of a dropped response. With idempotency already in place, a silent retry will either:

- recover the original successful insert (returning the same `id` + `internal_load_number`), or
- legitimately fail again, in which case we show the existing error toast.

Either way the user stops seeing false-failure toasts on orders that were actually created.

&nbsp;

Also add rederect after you create new order navigate user to /reports page