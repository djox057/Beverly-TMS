## Overview

Two pieces:
1. A typed HTTP client for App 2 (LoadMatch VPS at `http://128.140.115.63:8080/api/matched-orders`).
2. A "Load Suggestions" feature in Reports: a flashing `+` icon in each driver's first available future pickup cell that opens a panel of matched loads from App 2. Gated by a per-user permission set in User Management, and a runtime toggle in Reports for dispatchers.

## 1. App 2 client — `src/lib/loadMatch/client.ts`

Fresh module (project has no existing axios/fetch wrapper for external APIs — direct `fetch` per hook pattern).

```ts
export interface MatchedOrder {
  source_load_id: string;
  count: number;
  truck_id: string;
  origin_city: string;
  origin_state: string;
  dest_city: string;
  dest_state: string;
  equipment: "van";
  rate: number | null;
  deadhead_miles: number | null;
  score: number | null;
  pickup_start: string | null; // ISO 8601
  pickup_end: string | null;
}

export class LoadMatchError extends Error {
  constructor(msg: string, public cause?: unknown, public status?: number) { ... }
}

export async function getMatchedOrders(truckId?: string, signal?: AbortSignal): Promise<MatchedOrder[]>
```

- Base URL from `import.meta.env.VITE_LOADMATCH_URL` with fallback to `http://128.140.115.63:8080`.
- Builds `?truck_id=...` when provided.
- 15s timeout via `AbortController` (merged with caller's `signal` if passed).
- Non-2xx or network failure → throws `LoadMatchError` (never returns `[]` silently).
- No caching layer added; consumers will use React Query so caching is per-query.

**Flag to user (not implemented):** App 2 has no auth and CORS is `*`. If access control is needed, that's a separate decision.

## 2. Per-user "Suggestions" permission (User Management)

Add `suggestions_enabled boolean not null default false` to `profiles`.

- `AdminUsers.tsx`: add a Switch column/field "Suggestions" (admin-only edit), wired to update `profiles.suggestions_enabled`.
- `useAuth` / profile hook already selects `profile` — expose this flag.

RLS: existing profile policies already allow admin update / self read; no policy changes needed beyond confirming admins can update this field (they can, admins update profiles today).

## 3. Reports UI — flashing `+` and header toggle

### Header toggle (in same row as Empty trucks / Late trucks buttons, line ~4353 in `src/pages/Reports.tsx`)

- Visible only when `hasRole('dispatch') || hasRole('admin')` **AND** `profile.suggestions_enabled === true`.
- Dispatcher: toggle state persists per user (add `suggestions_mode boolean` to `profiles`, or reuse a client-side `useState` — plan: persist to `profiles.suggestions_mode` for parity with individual mode).
- Admin: toggle is shown but flipping it does not preload anything (see behavior).

### Prefetch behavior on toggle ON

New hook `src/hooks/useLoadSuggestions.ts`:

- Reads the list of drivers visible in Reports for the current user.
- **Dispatcher, toggle ON:** for each driver's `truck_id`, kick off `getMatchedOrders(truck_id)` via React Query `prefetchQuery` (staleTime ~2min). One call per driver.
- **Admin, toggle ON:** no bulk prefetch. Only fetches on individual `+` click.
- Toggle OFF: cancels/skips; per-truck queries fall back to on-demand.

Query key: `["load-matches", truckId]`.

### Flashing `+` icon in pickup cell

Reports renders a grid of driver rows × date columns with pickup/delivery cells. The `+` appears in **the first pickup cell whose date ≥ today (Chicago)** for each driver row, and only when:

- User has role `dispatch` or `admin` **AND** `profile.suggestions_enabled` is true **AND** header toggle is ON.
- The driver has an assigned `truck_id`.

Rendering:
- Small `Plus` icon (lucide) with a Tailwind `animate-pulse` (or a custom keyframe for a stronger flash) positioned in the cell (does not replace existing cell content; overlays as a small badge, e.g. top-right corner).
- Clicking it opens a Popover / Dialog listing matched loads for that truck, sorted by score desc (data already sorted server-side).
  - For dispatcher (toggle ON) the data is already prefetched → instant.
  - For admin, click triggers the fetch for that single truck (`getMatchedOrders(truck_id)`), shows a spinner, then renders.
- Popover content: table of `pickup_start | origin → dest | rate | DH miles | score | count`. Read-only for this task; no "assign to load" wiring.

Cell detection: identify the first future pickup cell per driver by iterating the existing per-driver column data in render (Reports already knows pickup datetimes per column) — attach the `+` overlay in the same cell renderer used at lines ~5311/5476/5684 where pickup cells render.

## 4. Env / config

- Add `VITE_LOADMATCH_URL=http://128.140.115.63:8080` to `.env` (documented; user can override).

## Technical details

- **Files added:**
  - `src/lib/loadMatch/client.ts` — typed client + `MatchedOrder` + `LoadMatchError`.
  - `src/hooks/useLoadSuggestions.ts` — React Query wrapper (`useMatchedOrders(truckId)`, `usePrefetchDriverMatches(driverList)`).
  - `src/components/reports/LoadSuggestionsPopover.tsx` — popover UI for the `+` click.
- **Files modified:**
  - `src/pages/Reports.tsx` — header toggle button (row at line ~4353); `+` overlay in the first-future-pickup cell renderer.
  - `src/pages/AdminUsers.tsx` — per-user "Suggestions" switch.
  - `src/hooks/useAuth.ts` — select `suggestions_enabled` (+ optionally `suggestions_mode`) on profile.
- **Migration:** add `suggestions_enabled boolean default false` and `suggestions_mode boolean default false` to `profiles`.
- **CORS:** already permissive on App 2, no proxy needed. Browser will hit App 2 directly.
- **Volume note:** we always call with `truck_id`, so response is small; the full-fleet code path is not exercised by this feature.
- **Out of scope:** authenticating App 2, writing back a chosen load into an order, polling loop.

## Open question

The task says the toggle turning on "will do nothing" for admin, but also that admin can still click a `+` to fetch that truck. I'll implement it exactly that way (admin toggle = only reveals the `+` icons; click = per-truck fetch). Say if you'd rather the admin toggle be hidden entirely and `+` always visible for admins.