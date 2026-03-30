

# Fix Afterhours Schedule Cron Jobs (33 & 36)

## Root Cause
The `process-afterhours-schedule` edge function is **not deployed** (returns 404). The cron jobs report "succeeded" because `net.http_post` only enqueues the request — it doesn't check the HTTP response.

## Additional Bug
The `todayStr` calculation uses `.toISOString().split('T')[0]` which converts Chicago time back to UTC, potentially querying the wrong date from `afterhours_schedule`.

## Plan

### 1. Simplify and redeploy `process-afterhours-schedule/index.ts`

Strip the function down to its core job:
- Read `action` from body or query param (`start` or `end`)
- Get today's date in Chicago timezone (fix the UTC conversion bug)
- Query `afterhours_schedule` for today's `user_id`s
- If `action=start`: UPDATE `user_roles` SET `role='afterhours'` WHERE `role='dispatch'` for each user
- If `action=end`: UPDATE `user_roles` SET `role='dispatch'` WHERE `role='afterhours'` for each user
- Remove the hour-based auto-detection (cron already passes the action explicitly)
- Fix date formatting to avoid the UTC reconversion issue

### 2. No cron job changes needed

Jobs 33 and 36 already pass `?action=start` and `?action=end` respectively, and use `CRON_SECRET` from vault correctly. The only issue is the function not being deployed, which will be fixed by saving the updated file (auto-deploy).

### Technical Details

**Date fix**: Replace `new Date(chicagoTime).toISOString().split('T')[0]` with manual `YYYY-MM-DD` formatting from the Chicago-localized date components to avoid UTC drift.

**Simplified flow**:
```text
Request → validate CRON_SECRET → parse action → get Chicago date
→ query afterhours_schedule for today → update user_roles → respond
```

