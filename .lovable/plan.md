

## Why this happened

The Resend domain `unitedenterprisesolutions.net` is verified — you're correct. Looking at the actual edge function logs, what Resend really returned was:

```
status: 408
message: "Operation timed out. Please try again later."
```

That's a transient Resend timeout, not a domain problem. But the edge functions append the same misleading sentence — `Sender domain "..." may need to be verified in Resend` — to **every** non-OK Resend response, regardless of cause. The driver/dispatcher saw that and naturally thought it was a verification issue.

This affects all three EFS-sending edge functions: `send-efs-other-request` (used by the fuel EFS dialog — what was hit here), `send-cash-advance-request`, and `void-efs-request`.

## Proposed fix

Two improvements:

### 1. Auto-retry on transient Resend failures

In `send-efs-other-request`, `send-cash-advance-request`, and `void-efs-request`, wrap the `fetch("https://api.resend.com/emails", ...)` call with a small retry helper:

- Retry up to 2 additional times (3 attempts total) on these statuses: `408` (timeout), `429` (rate limit), `500/502/503/504`, and on network/`fetch` exceptions.
- 600 ms backoff between attempts.
- No retry on `4xx` other than `408`/`429` (those are real config errors — verification, bad payload, etc.).

This will silently recover from the kind of timeout that just happened, so the dispatcher never sees the error.

### 2. Honest error messages

Replace the blanket `"...may need to be verified in Resend."` suffix with a status-aware message:

| Resend status | User-facing message |
|---|---|
| 408 / network timeout (after retries) | `Email service timed out. Please try again in a moment.` |
| 429 | `Email service is rate-limited. Please retry shortly.` |
| 5xx | `Email service is temporarily unavailable. Please try again.` |
| 401 / 403 | `Email service rejected the request (auth). Contact admin.` |
| 422 + message contains "domain" / "verify" / "from" | Keep the existing `Sender domain "<x>" may need to be verified in Resend.` |
| Other 4xx | Show Resend's raw message without the verification suffix |

Same logic applied to all three functions for consistency.

## Files to change

- `supabase/functions/send-efs-other-request/index.ts` — add retry wrapper + status-aware error mapping around the Resend `fetch`.
- `supabase/functions/send-cash-advance-request/index.ts` — same pattern.
- `supabase/functions/void-efs-request/index.ts` — same pattern (currently just bubbles `Resend error <status>` — also gets retry + better wording).

No DB schema, no UI, no client-side changes needed. The existing `EfsRequestDialog` already displays whatever `data.error` the edge function returns, so improving the wording on the server side automatically improves the toast the user sees.

## Out of scope

- The mileage/audit popovers and Drug Test expense work from earlier are unrelated and untouched.
- No changes to `send-efs-request` (the lumper-fee one) — it uses the Resend SDK and didn't trigger this error, but I'll mirror the retry into it as well so the next lumper-fee timeout is handled consistently. (Adding it here for completeness — let me know if you'd rather leave it alone.)

