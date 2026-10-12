# POD preview and message

Manual action for accounting, manager, and admin on Loads, BG Loads, LALE Loads, and UES Loads. Opening a row loads current POD records and signed previews; sending attaches the selected original documents and the user's message. Images and PDFs are supported. A sole POD is selected automatically; multiple PODs require explicit selection. No schema or document changes are made.

| Operation | Input | Result | Authentication |
| --- | --- | --- | --- |
| POST `send-pod-message`, action `preview` | `orderId` | Load number, signed POD URLs, To and Reply-To, or a recipient error | Valid user JWT plus an allowed database role |
| POST `send-pod-message`, action `send` | `orderId`, `message`, `selectedFileIds`, `requestId` | Resend email ID after acceptance | Same checks; user-scoped order and document reads |
| POST Resend `/emails` | Server-resolved addresses, message, original attachments | Provider email ID | Existing server-only `RESEND_API_KEY` |

Recipient matching uses `orders.booked_by` as an exact profile name or user ID. The manager is the unique manager-role profile in the booker's office. No match, duplicate match, absent office, or missing Auth email blocks sending and displays a reason. To uses the booker's Auth email; Reply-To uses the signed-in sender's Auth email and the manager's Auth email. No client-supplied recipient, storage path, attachment content, or role is trusted.

Only `order_files` records with the requested `order_id` and `file_category = POD` can be attached. RLS is preserved on order, file, role, and storage reads. The service client is used only to resolve Auth identity email addresses after authorization. Email HTML is escaped. Attachment limits are 20 documents and 25 MB of actual bytes (below Resend's 40 MB encoded limit). Requests time out after 30 seconds; the UI preserves the draft on failure and retries the same unchanged payload with the same Resend idempotency key. Idempotency lasts 24 hours per Resend documentation. Success means provider acceptance, not inbox delivery.

Provider documentation: https://resend.com/docs/api-reference/emails/send-email and https://supabase.com/docs/guides/functions/auth-legacy-jwt.

Validation: UI navigation/selection/role tests, server recipient and attachment rules, and mocked endpoint tests exercising authorization, forged recipients, foreign load documents, actual attachment size, missing files, and provider failures. Production manager mappings and POD content types were checked read-only. No test email was sent to staff. Deploy this endpoint with JWT verification enabled before publishing the UI. Roll back by reverting the UI commit; no background jobs or automatic sends are installed.
