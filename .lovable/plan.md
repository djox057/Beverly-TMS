

# Fix: Void Email Not Visible to Requester

## Problem
The original EFS request emails BCC the requester so they see the email in their inbox. The void "Please void this" email only goes to `efsrequest@gmail.com` without BCCing anyone, so the person who deleted the request never receives it and can't see it in their email thread.

## Solution
Update the `void-efs-request` edge function to BCC the current user (the person deleting the request) — same pattern used by `send-efs-other-request`.

## Changes

### `supabase/functions/void-efs-request/index.ts`
- Import Supabase client
- Extract the caller's email from the JWT (Authorization header), same pattern as `send-efs-other-request`
- Add `bcc: [callerEmail]` to the Resend email payload when available
- Add `reply_to` with the caller's email and the from address, matching the original request pattern

### Deploy
- Redeploy `void-efs-request` edge function

No frontend changes needed — the Authorization header is already passed automatically by `supabase.functions.invoke`.

