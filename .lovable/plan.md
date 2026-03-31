

# Fix: Void Email Not Sent on Delete

## Root Cause

Two issues:

1. **Edge functions not deployed** — The updated `send-efs-other-request`, `send-cash-advance-request`, and new `void-efs-request` functions have code changes but haven't been deployed to Supabase yet. Edge functions serve the **last deployed** code, not the code in project files.

2. **Existing records have no `resend_email_id`** — The column was just added, so all previously created EFS requests have `null` for `resend_email_id`. The deletion code skips the void email when this is null (by design). Only **new** requests created after deployment will store the Resend email ID.

## Changes

### 1. Deploy all three edge functions

Deploy `send-efs-other-request`, `send-cash-advance-request`, and `void-efs-request` so the live functions match the updated code.

### 2. Update deletion logic to always attempt void email

For requests that don't have a `resend_email_id` (old records), still send a void email — just without the threading headers. The email will go to `efsrequest@gmail.com` with subject `Re: EFS request by {lastNamePart}` and body "Please void this". Gmail will still thread it by subject line matching in most cases.

This means making `resendEmailId` optional in the `void-efs-request` edge function and in the frontend call — if it's missing, send the email without `In-Reply-To`/`References` headers.

### Technical Details

**Files modified:**
- `supabase/functions/void-efs-request/index.ts` — make `resendEmailId` optional; only add threading headers when present
- `src/pages/EfsRequests.tsx` — always call `void-efs-request` on delete (remove the `if (request.resend_email_id)` guard)
- Deploy: `send-efs-other-request`, `send-cash-advance-request`, `void-efs-request`

