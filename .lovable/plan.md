

# Fix: Void Email Wrong Sender and Broken Threading

## Problem
The void email sends from `efs@bfprime.net` instead of the original sender (e.g., `efs@unitedenterprisesolutions.net`). Edge function logs confirm `companyName` arrives as `null` from the frontend, causing fallback to the default. This also breaks Gmail threading since the FROM address differs from the original email.

## Root Cause
The frontend passes `request.company_name` to the void function, but this value is `null` at runtime (possibly due to stale deployed frontend or data edge cases). Relying on the frontend to pass this data is fragile.

## Solution
Make the `void-efs-request` edge function self-sufficient: pass the `requestId` and `source` (table name) so the function can look up the original record's `company_name` and `resend_email_id` directly from the database before sending the void email.

## Changes

### 1. `supabase/functions/void-efs-request/index.ts`
- Accept `requestId` and `source` (`'efs'` or `'cash_advance'`) in the request body
- Use service role key to query the original record from `efs_other_requests` or `driver_cash_advances` (joining to `drivers` for cash advances to get `company_name`)
- Use the looked-up `company_name` for `getEfsEmail()` instead of the client-provided value
- Use the looked-up `resend_email_id` for threading headers
- Keep `requestedByName` from the request body (for the subject line)

### 2. `src/pages/EfsRequests.tsx`
- Update the `void-efs-request` invocation to pass `requestId: request.id` and `source: request.source`
- Remove `companyName` and `resendEmailId` from the body (function will look them up)

### 3. Deploy
- Redeploy `void-efs-request`

