## Goal

Make `trucks.company_id` and `trucks.dispatcher_id` reliably mirror the assigned driver's values (`driver1.company_id` / `driver1.dispatcher_id`). No UI or behavior changes — the columns are just kept accurate as data.

## Verified current state

- Both columns exist on `trucks`.
- They are **not** synced today:
  - 365 rows where `trucks.dispatcher_id` ≠ `driver1.dispatcher_id`
  - 16 rows where `trucks.company_id` ≠ `driver1.company_id`
  - 31 rows with `driver1_id IS NULL` but stale `company_id`/`dispatcher_id`
- No existing trigger writes to `trucks.company_id` or `trucks.dispatcher_id`. The UI (`useTrucks.ts`) always derives them from `driver1` at read time, so the stored values have drifted.

## Changes (single migration)

### 1. One-time backfill

```sql
-- Fill from current driver1
UPDATE public.trucks t
SET company_id    = d.company_id,
    dispatcher_id = d.dispatcher_id
FROM public.drivers d
WHERE t.driver1_id = d.id
  AND (t.company_id    IS DISTINCT FROM d.company_id
    OR t.dispatcher_id IS DISTINCT FROM d.dispatcher_id);

-- Clear orphans (no driver1)
UPDATE public.trucks
SET company_id = NULL, dispatcher_id = NULL
WHERE driver1_id IS NULL
  AND (company_id IS NOT NULL OR dispatcher_id IS NOT NULL);
```

### 2. Keep in sync going forward (2 triggers)

- **`trucks` BEFORE INSERT OR UPDATE OF `driver1_id`**: if `driver1_id` is set, copy `company_id`/`dispatcher_id` from that driver; if null, null them.
- **`drivers` AFTER UPDATE OF `company_id`, `dispatcher_id`**: propagate the new values to `trucks` where `driver1_id = drivers.id`.

Both functions are `SECURITY DEFINER`, `SET search_path = public`, and only touch these two columns.

### 3. No frontend changes

`useTrucks.ts` and all consumers keep deriving display values from `driver1` exactly as today.

## Verification after migration

```sql
SELECT COUNT(*) FROM trucks t JOIN drivers d ON d.id = t.driver1_id
WHERE t.company_id IS DISTINCT FROM d.company_id
   OR t.dispatcher_id IS DISTINCT FROM d.dispatcher_id;
-- expect 0

SELECT COUNT(*) FROM trucks
WHERE driver1_id IS NULL AND (company_id IS NOT NULL OR dispatcher_id IS NOT NULL);
-- expect 0
```

## Out of scope

- Changing any component to read from `trucks.company_id`/`dispatcher_id` instead of `driver1`.
- RLS/grants (columns already exist).
- Historical snapshots — values follow the current driver, matching current UI behavior.
