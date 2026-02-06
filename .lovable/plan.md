

# Fix CPU Spikes: RLS Policy Optimization

## The Problem

Your app has **51 active users** (mostly on the Reports page — 223 pageviews today). The usage spikes that freeze the app for 1-2 minutes are caused by a massive hidden cost in your database: **Row-Level Security (RLS) policies**.

### What's happening under the hood

Every time a user fetches data, PostgreSQL checks RLS policies **for every single row**. Your policies use a `has_role()` function that queries the `user_roles` table. Here's the math:

```text
Orders table: 30 has_role() calls across 16 policies
User fetches 1,000 orders = 30,000 subqueries to user_roles
x 50 active users = 1,500,000 subqueries per refresh cycle
x refreshes every 2 min = millions of lookups per minute
```

The database stats confirm this: the `user_roles` table has **2.2 billion index lookups** — an astronomically high number for a table with only 111 rows.

The worst offenders by has_role() call count:
- `orders`: 30 calls across 16 policies
- `drivers`: 31 calls across 17 policies
- `trucks`: 29 calls across 19 policies
- `pickup_drops`: 26 calls across 14 policies

### Why it causes "spikes" not constant slowness

When multiple users navigate to Reports simultaneously (e.g., after a break or shift start), all their queries hit the database at once. Each query triggers thousands of RLS subqueries, saturating the CPU for 1-2 minutes until the backlog clears.

## Solution

Replace the per-row `has_role()` subquery approach with a **single cached role lookup** per query. Instead of checking `user_roles` 30 times per row, we check it **once** at the start of the query and cache the result.

### Step 1: Create an optimized role-checking function

Create a new function `auth_user_roles()` that returns the user's roles as an array. PostgreSQL can evaluate this once per statement and reuse the result:

```sql
CREATE OR REPLACE FUNCTION public.auth_user_roles()
RETURNS app_role[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(role), ARRAY[]::app_role[])
  FROM public.user_roles
  WHERE user_id = auth.uid();
$$;
```

Then create helper functions that use this cached array:

```sql
CREATE OR REPLACE FUNCTION public.has_any_role(roles app_role[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth_user_roles() && roles;
$$;
```

### Step 2: Replace RLS policies on the heaviest tables

Rewrite policies on the top 5 tables (orders, drivers, trucks, pickup_drops, companies) to use the new array-based check instead of multiple `has_role()` calls.

Before (current — 8 subqueries per row):
```sql
USING (
  has_role(auth.uid(), 'dispatch') OR 
  has_role(auth.uid(), 'afterhours') OR 
  has_role(auth.uid(), 'manager') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'accounting') OR
  has_role(auth.uid(), 'supervisor') OR 
  has_role(auth.uid(), 'safety') OR 
  has_role(auth.uid(), 'maintenance')
)
```

After (optimized — 1 lookup cached across all rows):
```sql
USING (
  has_any_role(ARRAY['dispatch','afterhours','manager',
    'admin','accounting','supervisor','safety','maintenance']::app_role[])
)
```

### Step 3: Additional polling optimizations

Increase stale times for hooks that still poll aggressively:

| Hook | Current staleTime | New staleTime | Change |
|------|------------------|---------------|--------|
| `useDrivers.ts` | 5min but `refetchOnMount: 'always'` | 5min with `refetchOnMount: true` | Stop bypassing cache |
| `useTrucks.ts` | 30s | 2 min | Reduce refetch on navigation |
| `useTrailers.ts` | 30s | 2 min | Reduce refetch on navigation |

### Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| user_roles lookups per 1000-row query | ~30,000 | ~1 |
| CPU during multi-user spike | 100% (frozen) | Under 30% |
| Reports page load time | 5-15 seconds | Under 2 seconds |

### Technical Notes

- The `STABLE` marker tells PostgreSQL the function returns the same result within a single statement, enabling it to cache the result
- `SECURITY DEFINER` ensures the function runs with the correct permissions
- No application code changes are needed for RLS — the policies are transparent to the frontend
- The migration will DROP and re-CREATE the affected policies in a single transaction to avoid any window of no security
- The old `has_role()` function is kept for backward compatibility but won't be called on hot paths

