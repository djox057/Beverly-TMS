

## Create `send-afterhours-sms` Edge Function (Test Mode)

### Overview
Create the new Edge Function that sends morning SMS to afterhours-assigned drivers. For testing, **all messages will be sent to `+1 5742085611`** instead of actual driver phone numbers.

### New File: `supabase/functions/send-afterhours-sms/index.ts`

**Logic flow:**
1. Authenticate via `CRON_SECRET` (same as `process-afterhours-schedule`)
2. Get today's date in Chicago timezone
3. Query `afterhours_schedule` for today to confirm it's a scheduled day
4. Query `afterhours_assignments` for today, joined with:
   - `profiles` (on `afterhours_user_id`) → dispatcher `full_name` + `phone_number`
   - `drivers` (on `driver_id`) → driver `phone`
5. For each assignment:
   - Extract dispatcher last name (last word of `full_name`)
   - Strip `+1` from dispatcher's `phone_number`
   - **TEST MODE: Send SMS to `+15742085611`** instead of driver's actual phone
   - Message: `"Good morning, your dispatcher for today will be {LastName}, you can contact him directly via this number {dispatcherPhone}"`
6. Uses RingCentral auth (same pattern as existing `send-sms` function)

**Test override** — a constant at the top of the file:
```typescript
const TEST_OVERRIDE_NUMBER = "+15742085611"; // Remove to send to real drivers
```

### Config Update: `supabase/config.toml`
Add:
```toml
[functions.send-afterhours-sms]
verify_jwt = false
```

### Cron Job
A `pg_cron` schedule to trigger daily at 13:00 UTC (7 AM Chicago CDT). The function checks `afterhours_schedule` so it only sends on scheduled days. Will be set up via SQL editor after deployment.

