# COI Request Button (Reports → Load Info)

Add a **COI** button to the left of the "Lumper Request" button in the load info popup, which collects broker details and emails a certificate-holder request to the insurance contacts, sent from the booked-by company's dispatch address.

## User flow

1. In the load info popup, click **COI**.
2. A dialog collects:
   - Broker name (required)
   - Broker email (required, validated)
   - Broker full address (required)
3. Click **Send Request** → email is sent, dialog shows a confirmation of what was sent.

## Email content

- Subject: `COI Request - <Broker Name>`
- Body:
  ```
  Please put this broker as a Certificate Holder and email it to <broker email>:

  <Broker Name>
  <Full Address>
  ```
- No load details, no attachments, nothing stored in the database.

## Routing rules (based on the load's booked-by company)

| Booked-by company | From | To |
|---|---|---|
| BF Prime LLC | dispatch@bfprime.net | COI@atsinsure.com **and** Futurecertificates@worldinsurance.com |
| BG Prime | dispatch@bgprime.net | Futurecertificates@worldinsurance.com |
| Beverly Freight | dispatch@beverlyfreight.net | Futurecertificates@worldinsurance.com |
| AP Silver Trans | dispatch@apsilvertrans.net | Futurecertificates@worldinsurance.com |
| United Enterprise Solutions | Dispatch@unitedenterprisesolutions.net | Futurecertificates@worldinsurance.com |
| Fallback / unknown | dispatch@bfprime.net | COI@atsinsure.com + Futurecertificates@worldinsurance.com |

**CC:** the requester's email local part combined with the booked-by company's domain — e.g. requester `zane@bfprime.net` on a BG Prime load is CC'd at `zane@bgprime.net`. Reply-To is set to that same CC address plus the sending dispatch address.

## Technical details

- **New edge function** `supabase/functions/send-coi-request/index.ts`:
  - Requires an `Authorization` header; resolves the requester's identity from the JWT (same pattern as `send-efs-request`), so the CC can't be spoofed from the client.
  - Validates the body with Zod (broker name, email, address, booked-by company name).
  - Maps company name → dispatch sender + recipient list using normalized substring matching, mirroring `getEfsEmail` in `send-efs-request`.
  - Sends via Resend using the existing `RESEND_API_KEY`.
  - Returns the composed confirmation text for display.
- **`src/pages/Reports.tsx`**:
  - New state for dialog open, form fields, submitting flag, confirmation text.
  - `COI` button placed immediately before the Lumper Request button in the same action row (visible to the same audience as Lumper Request).
  - New dialog styled like the existing Lumper Request dialog, passing `zoomedLoad.bookedByCompanyName` to the function.
- Client-side validation with Zod before invoking; toast on error.

## Notes

The dispatch sender domains must already be verified in Resend for the emails to deliver — the existing EFS senders use the same domains, so `bfprime.net`, `bgprime.net`, `beverlyfreight.net`, `apsilvertrans.net` and `unitedenterprisesolutions.net` should be fine.
