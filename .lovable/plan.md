## Root cause

The Lovable preview is served over HTTPS, but `src/lib/loadMatch/client.ts` calls App 2 over plain HTTP (`http://128.140.115.63:8080`). Browsers block HTTP subresource requests from HTTPS pages — that's the `NetworkError when attempting to fetch resource` in your network log. The VPS is fine; the request never leaves the browser.

## Fix

Add a Supabase edge function that server-side proxies the request. Browser → HTTPS edge function → HTTP VPS. Also gives us an auth choke point (JWT verification + optional shared secret) so the VPS can eventually be firewalled.

## Steps

1. **Edge function** `supabase/functions/loadmatch-proxy/index.ts`
   - Validates the caller's JWT via `getClaims()` (rejects anonymous).
   - Reads optional `truck_id` query param, validates it as a UUID with Zod.
   - Fetches `http://128.140.115.63:8080/api/matched-orders?truck_id=<id>` with a 15s timeout.
   - If `LOADMATCH_SHARED_SECRET` is set as a secret, forwards it as `Authorization: Bearer <secret>` so you can lock down the VPS later without a code change here.
   - Returns the JSON array with CORS headers, or a structured JSON error with the upstream status.

2. **Client** `src/lib/loadMatch/client.ts`
   - Replace the direct `fetch(http://128.140.115.63:8080/...)` with `supabase.functions.invoke("loadmatch-proxy", { body: { truck_id } })` (using GET-style query via a POST body — invoke uses POST; edge function will read `truck_id` from JSON body or query param).
   - Keep the existing `LoadMatchError`, timeout, and typed `MatchedOrder[]` return so `useLoadSuggestions` and the popover keep working unchanged.
   - Drop `VITE_LOADMATCH_URL` — no longer needed.

3. **Optional (recommended, not blocking)**
   - Add a `LOADMATCH_SHARED_SECRET` secret. Once set, tell you the value so you can add it as a required `Authorization` header on the VPS and firewall the port to only accept requests bearing it. Until you configure the VPS side, this secret is harmless — the function only sends it if present.

## Files touched

- `supabase/functions/loadmatch-proxy/index.ts` (new)
- `src/lib/loadMatch/client.ts` (rewrite `getMatchedOrders` to call the edge function)

No changes to `useLoadSuggestions.ts`, `LoadSuggestionsPopover.tsx`, or `Reports.tsx` — the client function keeps its signature.

## Verification

- Toggle Suggestions in Reports as a dispatcher → prefetch fires against `.../functions/v1/loadmatch-proxy?truck_id=...` (HTTPS) instead of `http://128.140.115.63:8080`.
- Click a flashing `+` → popover shows loads or a clean "No matching loads" message; no more `NetworkError`.
- Check edge function logs for any 4xx/5xx and confirm the VPS is actually being reached from the function.
