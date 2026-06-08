## Auto-delete empty orders after 7 days

Create a scheduled job that deletes orders matching ALL of:
- `freight_amount = 0` OR NULL
- `driver_price = 0` OR NULL
- `loaded_miles = 0` OR NULL
- `dh_miles = 0` OR NULL
- `created_at < now() - interval '7 days'`

### Implementation

1. **New edge function** `supabase/functions/cleanup-empty-orders/index.ts`
   - Auth: `CRON_SECRET` bearer or service-role only (per security memory — no anon bypass).
   - Uses service-role client to run the delete.
   - Logs deleted count + IDs.
   - Registered in `supabase/config.toml` with `verify_jwt = false`.

2. **Cron schedule (pg_cron + pg_net)** — runs daily at ~03:00 Chicago (09:00 UTC):
   ```
   select cron.schedule('cleanup-empty-orders-daily', '0 9 * * *', $$
     select net.http_post(
       url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/cleanup-empty-orders',
       headers:='{"Content-Type":"application/json","Authorization":"Bearer <CRON_SECRET>"}'::jsonb,
       body:='{}'::jsonb
     );
   $$);
   ```
   Inserted via the insert tool (not migration) per the schedule-jobs guidance.

### Deletion SQL inside the function
```ts
.from('orders').delete()
  .lt('created_at', new Date(Date.now() - 7*24*3600*1000).toISOString())
  .or('freight_amount.is.null,freight_amount.eq.0')
  .or('driver_price.is.null,driver_price.eq.0')
  .or('loaded_miles.is.null,loaded_miles.eq.0')
  .or('dh_miles.is.null,dh_miles.eq.0')
```
(PostgREST `.or()` chaining ANDs the groups together.)

### Questions / assumptions
- Treating NULL as zero (a brand-new order with all four fields empty qualifies). Confirm if you want **strict `= 0`** only (NULLs excluded) instead.
- Applies to ALL orders regardless of locked/canceled/invoiced status. Confirm if locked/invoiced orders should be excluded.
- No backup/archive — straight delete. FK cascades on `orders` (pickup_drops, order_files, etc.) already handle children.

### Out of scope
- UI changes, manual trigger button, soft-delete/archive table.
