## Add `canceled = true` requirement to empty-order cleanup

Update `supabase/functions/cleanup-empty-orders/index.ts` to require `canceled = true` in addition to the existing conditions. An order is deleted only if ALL apply:

- `created_at < now() - 7 days`
- `canceled = true`  ← new
- `freight_amount` is 0 or NULL
- `driver_price` is 0 or NULL
- `loaded_miles` is 0 or NULL
- `dh_miles` is 0 or NULL

Single-line change: add `.eq("canceled", true)` to the delete query. Cron schedule unchanged.
