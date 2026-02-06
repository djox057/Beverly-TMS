

# Fix: Database Overload from Aggressive Polling

## Problem

Your Supabase database is at 100% CPU because of a self-reinforcing overload cycle. The logs show dozens of "canceling statement due to statement timeout" errors every second. Here's what's happening:

```text
Every 30s: Yard loads count query fires (from sidebar - on EVERY page)
Every 30s: Yard loads data query fires (on Yard Loads page)
Every 30s: Reports priority query fires (on Reports page)
Every 60s: Reports background query fires
   +
On failure: TanStack Query retries each 3 times automatically
   +
Realtime subscriptions reconnect on error, adding more load
   =
Database permanently at 100%, queries never complete
```

The biggest offender is `useYardLoadsCount` -- it runs from the **sidebar** on every single page, for every user, every 30 seconds, doing an exact count scan on the orders table.

## Solution

Reduce polling frequency and disable retries for non-critical queries to break the overload cycle.

### Changes

**1. `src/hooks/useYardLoadsCount.ts`** -- Sidebar badge count (runs on ALL pages)
- Change `refetchInterval` from 30s to **5 minutes** (300,000ms)
- Change `staleTime` from 30s to **5 minutes**
- Add `retry: false` to prevent retry storms

**2. `src/hooks/useYardLoadsFromOrders.ts`** -- Yard loads page data
- Change `refetchInterval` from 30s to **2 minutes** (120,000ms)
- Add `retry: 1` (single retry instead of default 3)

**3. `src/hooks/useReports.ts`** -- Reports page queries
- Change priority query `refetchInterval` from 30s to **2 minutes**
- Change background query `refetchInterval` from 60s to **5 minutes**
- Add `retry: 1` for both

These changes will immediately reduce the query volume by roughly 10x, which should break the overload cycle and let your database recover.

### Technical Details

| Query | Current Interval | New Interval | Retries |
|-------|-----------------|-------------|---------|
| Yard loads count (sidebar) | 30s | 5 min | 0 (disabled) |
| Yard loads data | 30s | 2 min | 1 |
| Reports priority | 30s | 2 min | 1 |
| Reports background | 60s | 5 min | 1 |

Real-time subscriptions already handle immediate updates when data changes, so the polling intervals only need to catch edge cases where realtime misses an event. 5 minutes is more than sufficient for that purpose.

