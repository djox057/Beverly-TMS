# Fix "—" for miles away — keep stale values up to 24h, no badges

## Root cause (confirmed via live data)

`update-truck-distances` currently overwrites `trucks.miles_away` with `NULL` whenever Samsara's last GPS ping for that truck is older than 30 minutes. For Čačak right now, 16 trucks fall into this bucket and render as "—", even though they had a perfectly good value an hour ago.

A secondary contributor: the `adapter-trucks` React Query has `staleTime: 300_000` (5 min) and no `refetchOnWindowFocus`, so even when the DB has fresh values, the browser keeps showing old NULLs for several minutes.

## Plan

### 1. Stop nuking `miles_away` for short-term stale GPS (server)
File: `supabase/functions/update-truck-distances/index.ts`

- Add a new column `trucks.miles_away_updated_at timestamptz` (migration with GRANTs).
- On every successful recompute, set `miles_away = X` AND `miles_away_updated_at = now()`.
- When Samsara returns no fresh location for a truck:
  - If the existing `miles_away_updated_at` is within the last 24 hours → leave `miles_away` and `eta_minutes` untouched (skip the update entirely).
  - If older than 24 hours OR null → set `miles_away = NULL` (current behavior, so genuinely abandoned trucks still clear out).

No UI badge, no sentinel — the dispatcher just sees the last known number for up to 24h.

### 2. Make the browser pick up fresh values quickly (client)
File: `src/hooks/useReportsDateWindowAdapter.ts`

- Lower `adapter-trucks` `staleTime` from `300_000` → `60_000`.
- Add `refetchOnWindowFocus: true` on that query so coming back to the tab pulls the latest cron output.

That's it — no UI changes, no schema-visible labels, and the "—" only appears for trucks that haven't had a valid GPS-derived distance in the past 24 hours.

## Technical notes

- Migration: `ALTER TABLE public.trucks ADD COLUMN miles_away_updated_at timestamptz;` (no new table, so no extra GRANTs needed — `trucks` already has them).
- Backfill: `UPDATE public.trucks SET miles_away_updated_at = now() WHERE miles_away IS NOT NULL;` so the next stale-GPS run doesn't immediately wipe everything.
- The 30-min Samsara freshness threshold in `samsara-locations` stays as-is — we just no longer punish the dispatcher view for it.
- `useTrucks` (global) is unchanged; only the Reports adapter query is tuned.
