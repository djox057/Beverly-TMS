

## Trips Search Performance — Updated Plan

### Verification Result

**`recovery_history` IS used in the Trips rendering path.** `Trips.tsx` lines 836-855 read `order.recoveryHistory` to display recovery driver/truck/trailer info on recovery load segments. Removing it from the select would cause recovery segments to render with "Unknown" values.

**`order_files` is NOT used** in Trips rendering — safe to remove.

### Revised Changes

| # | File | Change |
|---|------|--------|
| 1 | `src/hooks/useTripsLazyOrders.ts` line 249 | Change `%${searchLower}%` → `${searchLower}%` (prefix-only wildcard) |
| 2 | `src/hooks/useTripsLazyOrders.ts` `ORDERS_JOINED_SELECT` | Remove only `order_files(id, order_id, file_category, file_name, file_path)`. **Keep `recovery_history(*)`** — it's consumed by Trips.tsx for recovery segment rendering. |
| 3 | New migration | Add btree index: `CREATE INDEX IF NOT EXISTS idx_orders_broker_load_number_prefix ON orders (broker_load_number text_pattern_ops);` |

### Why recovery_history stays

`Trips.tsx` reads `order.recoveryHistory[0]` to extract recovery driver name, truck number, and trailer number for recovery load segments. `transformOrders` maps `order.recovery_history` → `order.recoveryHistory`. Dropping it from the joined select would silently produce empty arrays, breaking recovery segment display.

### Expected impact

- Wildcard fix: full table scan → index scan (seconds → milliseconds)
- Removing `order_files`: smaller payload, fewer joins
- New btree index: optimal for prefix `LIKE 'value%'` queries
- Target: <1s end-to-end

