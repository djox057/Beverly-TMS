## What's slow

From your logs, the Orders page sits at "loading" for ~6.5s before any rows fetch starts:

```
unlocked count query:    733ms
locked count query:    6,443ms   ← the bottleneck
counts DONE in 6,445ms
→ page 1 starts only AFTER this
```

The `locked count query` is a `SELECT count(*) … WHERE locked = true AND booked_by_company_id = …` against ~34k locked rows. Postgres has to scan/aggregate the entire matching set before it can answer — and we block the first page render on it.

The unlocked-count is fast (835 rows). The locked-count is what we're really paying for, and it's only used to compute `totalPages` for the paginator (the locked rows don't even show on page 1 — they only appear once you scroll past page ~9).

## Fix

Decouple page-1 rendering from the locked count.

### Step 1 — Render page 1 from the unlocked count only

In `src/hooks/useOrdersProgressive.ts`:

- Split `countsQuery` into two independent queries: `unlockedCountQuery` and `lockedCountQuery`.
- Gate `currentPageQuery` (and the "ready to render" state) on `unlockedCountQuery` only.
- While `lockedCountQuery` is still in flight, treat `lockedCount` as `0` and compute `totalPages` from unlocked only. The paginator will start at "page 1 of 9" and expand to "page 1 of 347" once the locked count resolves. No visible flicker on page 1.

Expected effect: first paint of orders drops from ~6.5s + page fetch → ~0.7s + page fetch.

### Step 2 — Make the locked count cheap

Two options, ordered by preference:

**Option A (recommended): use Postgres' planner estimate instead of an exact count.**

Add a SQL function `public.estimate_locked_orders_count(p_booked_by_company_id uuid, p_excluded_booked_by_company_id uuid, p_booked_by uuid, p_driver_ids uuid[])` that returns `pg_class.reltuples`-style estimate via `EXPLAIN (FORMAT JSON)` of the same filter. Returns in single-digit ms regardless of dataset size. The paginator only needs an approximate total — being off by a few rows on page 347 is invisible to the user.

Call it from `lockedCountQuery` instead of `SELECT count(*)`.

**Option B (fallback): cache the locked count in TanStack Query for longer.**

Bump `staleTime` for `lockedCountQuery` from 30s to e.g. 10 min, and persist it across navigations. First visit still pays 6.4s, but subsequent visits are instant. Combined with Step 1 the first visit is still acceptable because the page is already interactive.

I recommend doing **Step 1 + Option A** together.

### Step 3 — Verify

Reload `/orders` and confirm in console:
- `unlocked count query: <800ms`
- Page 1 starts fetching immediately after, not after 6s.
- `locked count query` resolves in the background (instant if Option A, ~6s if Option B) and the paginator total updates without disrupting the visible rows.

## Files to touch

- `src/hooks/useOrdersProgressive.ts` — split counts queries, gate render on unlocked only, treat locked count as 0 while pending.
- One new migration adding `public.estimate_locked_orders_count(...)` (Option A only).

No changes to `Orders.tsx`, edge functions, or RLS.

## Out of scope

- The `lovable-stack-overflow` snippet about "webhooks for the locked count" is not applicable here — this is a single SQL `COUNT(*)`, not a long-running job. Async/webhook patterns would add complexity without solving the underlying scan cost.
