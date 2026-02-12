

## Fire `record-lost-days` at 23:59 UTC

### What changes

1. **Edge function** (`supabase/functions/record-lost-days/index.ts`)
   - Remove the hour check (`currentHour !== 10`) so it runs whenever called -- the cron schedule itself controls timing.
   - Keep all existing logic (working day check, holiday check, off-duty dispatcher lookup, upsert).

2. **Cron job** (SQL, run via SQL editor -- not a migration)
   - Create a new `pg_cron` job named `record-lost-days-daily` scheduled at `59 23 * * *` (23:59 UTC every day).
   - This fires the edge function at end-of-day so it captures the accurate lost day snapshot.

### Technical details

**Edge function edit** -- remove lines 152-158 (the `currentHour !== 10` guard):

```diff
-    if (!force && currentHour !== 10) {
-      console.log('Not 10am Chicago time, skipping');
-      return new Response(
-        JSON.stringify({ message: 'Not 10am Chicago time, skipping', hour: currentHour }),
-        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
-      );
-    }
```

**Cron job SQL** (inserted via SQL editor, not migration):

```sql
SELECT cron.schedule(
  'record-lost-days-daily',
  '59 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/record-lost-days',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body := '{"time":"scheduled"}'::jsonb
  ) AS request_id;
  $$
);
```

Note: The function uses `CRON_SECRET` for auth. The cron job sends the anon key. We need to update the auth check to also accept the anon key, OR send the CRON_SECRET instead. Since other cron jobs use `CRON_SECRET`, the cron call header should use `Bearer <CRON_SECRET>`. This will be handled by referencing the secret from vault or by using the same pattern as other cron jobs in the project (e.g., `record-empty-days`).

Let me check how existing cron jobs handle the CRON_SECRET auth -- the SQL will match that pattern.

### Why 23:59 UTC?

23:59 UTC = 5:59 PM / 6:59 PM Chicago time (depending on CDT/CST). This captures the full working day's dispatcher status before the day ends, giving an accurate end-of-day lost day count.

