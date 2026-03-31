

# Send "Please void this" as Reply to Original EFS Email

## Problem
Currently, neither `efs_other_requests` nor `driver_cash_advances` stores the Resend email message ID from the original send. Without it, we cannot use Resend's `In-Reply-To` / `References` headers to create a true email reply in the same thread.

## Changes

### 1. Database Migration — Add `resend_email_id` column to both tables

```sql
ALTER TABLE efs_other_requests ADD COLUMN resend_email_id text;
ALTER TABLE driver_cash_advances ADD COLUMN resend_email_id text;
```

### 2. Update `send-efs-other-request` Edge Function

After the Resend API call succeeds, extract `emailResult.id` (the Resend message ID) and store it in the `efs_other_requests` row via the insert that already happens on line 233.

### 3. Update `send-cash-advance-request` Edge Function

Same change — after successful Resend send, store `emailResult.id` in `driver_cash_advances` row (the insert on line 185).

### 4. Update `send-efs-request` Edge Function (lumper requests)

This function uses the Resend SDK (`resend.emails.send`). Store `emailResponse.data.id` back to the order or a related record. However, lumper EFS requests are stored in `efs_other_requests` too — need to verify. Actually, lumper requests update orders and don't insert into `efs_other_requests`. Since the EFS Requests page only shows `efs_other_requests` and `driver_cash_advances`, we only need to handle those two functions.

### 5. Create `void-efs-request` Edge Function

A new edge function that:
- Accepts: `resendEmailId`, `driverName`, `truckNumber`, `amount`, `purpose`, `companyName`
- Uses the same `getEfsEmail(companyName)` logic for the sender
- Sends via Resend REST API with:
  - `headers: { "In-Reply-To": "<resendEmailId>", "References": "<resendEmailId>" }` — this threads it as a reply to the exact original email
  - Same `from` address as original
  - Subject: `Re: EFS request by ...` (extracts last name from the original request's `requested_by`)
  - Body: `"Please void this"`

### 6. Update `src/pages/EfsRequests.tsx`

- Update `deleteItem` state to store the full request object (not just id/source)
- Update the EfsRequest interface to include optional `resend_email_id` and `driver_id`
- Fetch `resend_email_id` from both tables in the query
- In the delete mutation, call `void-efs-request` edge function first (passing `resendEmailId` and request details), then delete the record
- If the void email fails, show a warning but still proceed with deletion

### Technical Details

**Resend threading**: Resend supports custom email headers. By setting `In-Reply-To` and `References` to the original email's Message-ID (format: `<resendEmailId@resend.dev>`), email clients like Gmail will thread the void reply directly under the original EFS request email.

**Files modified:**
- `supabase/functions/send-efs-other-request/index.ts` — store `resend_email_id`
- `supabase/functions/send-cash-advance-request/index.ts` — store `resend_email_id`
- `supabase/functions/void-efs-request/index.ts` — new function
- `src/pages/EfsRequests.tsx` — call void function on delete
- Database migration for both tables

