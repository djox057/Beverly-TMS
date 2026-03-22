

## Fix: Afterhours Schedule Role Switching Not Working

### Root Cause (Two issues)

**Issue 1: Query params likely not received.** The cron jobs pass `?action=start` / `?action=end` as URL query parameters. Supabase Edge Functions can be unreliable with query params passed via `net.http_post`. When `action` is `null`, the function falls into the auto-determine logic.

**Issue 2: Auto-determine hours are wrong due to DST.** The fallback checks `currentHour === 6` for start and `currentHour === 17` for end. But:
- Cron `afterhours-start` runs at `0 12 * * 0,6` (12:00 UTC). In CDT (March = daylight saving, UTC-5), that's **7 AM Chicago**, not 6 AM.
- Cron `afterhours-end` runs at `0 23 * * 0,6` (23:00 UTC). In CDT, that's **6 PM Chicago**, not 5 PM.

Result: `scheduleAction` stays `null` → function returns "No action needed at this time" → no roles are switched. This explains why Saturday users are still stuck in `afterhours` and the end action never fires.

**Evidence:** Cron job runs show `succeeded` (HTTP request was submitted), but no edge function logs exist, and Saturday's scheduled users (3/21) are still in `afterhours` role despite the end cron having fired.

### Fix Plan

**File: `supabase/functions/process-afterhours-schedule/index.ts`**

1. **Pass action in POST body instead of query params** — Change the function to read `action` from the JSON body as primary source, with query param as fallback:
   ```typescript
   const body = await req.json().catch(() => ({}));
   const action = body.action || url.searchParams.get('action');
   ```

2. **Widen the auto-determine hour windows** — Instead of checking exact hours, use ranges to handle DST drift:
   ```typescript
   if (currentHour >= 6 && currentHour <= 7) scheduleAction = 'start';
   else if (currentHour >= 17 && currentHour <= 18) scheduleAction = 'end';
   ```

3. **Add error handling on role delete/insert** — Currently errors are silently ignored. Log and track failures.

**Cron jobs (SQL update via migration or direct SQL):**

4. **Update cron jobs to pass action in the body** instead of query params:
   - `afterhours-start`: Change `body` from `'{}'::jsonb` to `'{"action":"start"}'::jsonb`, and remove `?action=start` from URL
   - `afterhours-end`: Change `body` from `'{}'::jsonb` to `'{"action":"end"}'::jsonb`, and remove `?action=end` from URL

5. **Fix cron UTC times for CDT** (optional, since body-based action removes the dependency on auto-determine):
   - Start: `0 11 * * 0,6` (11:00 UTC = 6 AM CDT)
   - End: `0 22 * * 0,6` (22:00 UTC = 5 PM CDT)

**Immediate manual fix:** After deploying, manually invoke the end action to switch Saturday's stuck users back to `dispatch`.

### Files Changed
- `supabase/functions/process-afterhours-schedule/index.ts` — Read action from body, widen hour fallback, add error handling
- Cron job SQL update — Pass action in body, fix UTC schedule times

