

## Fix Empty Days: Server-Side RPC with Correct Algorithm

### What changes

| Location | Change |
|----------|--------|
| Database migration | Create `calculate_empty_days_by_dispatcher` RPC function |
| `src/hooks/useDailyDriverStats.ts` | Add `fetchEmptyDaysByDispatcher` using RPC call, update `useDailyDriverStatsByDispatcher` hook to use it |
| `src/pages/Analytics.tsx` | No changes needed -- existing `emptyDaysMap` logic already reads `lost_day_count` from the hook |

---

### 1. Database migration -- create RPC

Create `calculate_empty_days_by_dispatcher(p_start_date date, p_end_date date, p_office text DEFAULT NULL)` that:

- Generates all (active driver, date) pairs via `CROSS JOIN generate_series`
- Joins drivers to `profiles` on `dispatcher_id` for office scoping (matches how Analytics filters by office everywhere else)
- Builds a `driver_orders` CTE covering both `driver1_id` and `driver2_id` (team driver support), with an `effective_dd` column: uses `original_delivery_datetime` when it exists AND is earlier than `delivery_datetime` (reschedule penalty), otherwise uses `delivery_datetime`
- Marks a driver-day as empty when: (a) no pickup on that date, AND (b) not in transit (no order where `pickup < target AND effective_delivery > target`)
- Groups by `dispatcher_id, office` and returns `(dispatcher_id uuid, office text, empty_day_count bigint)`

### 2. Hook update

Replace the body of `fetchDailyStatsByDispatcher` (or add a parallel function) to call:

```typescript
const { data, error } = await supabase.rpc('calculate_empty_days_by_dispatcher', {
  p_start_date: startDate,
  p_end_date: endDate,
  p_office: office || null
});
```

Map the result back to `DispatcherDailyStats[]` with `lost_day_count = empty_day_count`. The existing `emptyDaysMap` in Analytics.tsx already reads `lost_day_count`, so no changes needed there.

### 3. No Analytics.tsx changes

The existing code from the previous edit already wires `emptyDaysMap[validUserId]` into the table. Once the hook returns correct data, the column will display correctly.

---

### Confirmed design decisions

- Office scoping: via dispatcher's profile office (matches all other Analytics metrics)
- Delivery day = empty (driver delivered and is waiting)
- Weekends included
- Home time does NOT exclude empty days
- Reschedule penalty: transit window shrinks to `original_delivery_datetime` when it was moved later
- All required indexes already exist (`driver1_id`, `driver2_id`, `pickup_datetime`)

### Expected results for Feb 2--8, 2026

- Adonis Dzafo-Ron: 4 empty days
- Stefan Vuckovic-Paul: 7 empty days
- Svetlana Garic-Holly: 5 empty days

