# External Google Form → TMS pre-trip inspection

The driver form stays separate from TMS. An owner-authorized Apps Script attached to its response sheet forwards each submission and private uploaded photo to `receive-pretrip-form`. TMS never needs Google service-account sharing, public Google links, or drivers' TMS accounts.

## Google setup (form owner)

1. In the existing Google Form's **Responses** tab, link a new Google Sheet, or keep its existing response sheet. Switching the response destination requires the form owner's access. A spreadsheet alone does not change where an existing form sends responses.
2. An authenticated admin/manager can provision the scoped bridge token through `rotate_pretrip_form_token`. Keep the generated script private; setup controls are intentionally absent from the operational report.
3. In the response sheet, open **Extensions → Apps Script**, replace the editor contents with that generated code and save.
4. Run **installPretripBridge** and authorize the Google permissions as an account that can read the response sheet and its uploaded files. The script installs an on-form-submit trigger and a retry trigger every five minutes. No web-app deployment or spreadsheet sharing is required.
5. Submit one real response. Verify `_TMS Status = Imported` in Google and the matching TMS inspection date, driver/email, truck/trailer, issues and all eight photo categories. Repeat imports to confirm no duplicate records.

`integrations/google-pretrip/Code.gs` is the token-free source template. `appsscript.json` documents explicit scopes: spreadsheets, read-only Drive, trigger management and external requests. Do not copy a TMS service-role key into Google. The generated token is limited to receiving pre-trip responses/photos. The former polling endpoint returns 410, and its cron is unscheduled by the follow-up migration.

## Data and UI

Every original question/answer is retained alongside normalized driver name, email, actual inspection date, truck/trailer numbers, complaints, sheet timestamp and timezone. Dates are converted without shifting the inspection day. Empty/invalid required values are quarantined with the raw answers and an error rather than invented. Extra columns are kept; `_TMS` status columns are excluded from payloads and fingerprints.

Photo categories: front headlights/turn signals; steering axle; truck drive axles 1/2; trailer axles 1/2; truck/trailer DOT stickers. Private bytes are copied into `pretrip-photos`, linked to their response and visible in the existing Pictures gallery. Viewers get signed URLs under existing pre-trip role permissions. Images must be at most 10 MB.

A **Google Form** table column opens all response details and categorized photos. Driver complaints appear alongside staff-maintained Problems. Staff notes and reviewer Checked status stay separate. Weekly navigation groups actual inspection dates from Monday through Sunday (Chicago). One photo submission on any day satisfies the weekly missing-photo badge. Photos and form details retain their original inspection dates. Staff checks apply to the whole selected week, including earlier daily checkmarks.

## Matching and reliability

Truck numbers match a unique active unit after trimming whitespace, removing a leading `#` and ignoring case. Leading zeros matter. Unknown or ambiguous trucks remain under **Needs attention** and in Google retry status. Correct the response sheet and the retry trigger sends the changed snapshot.

Content hashes survive sheet sorting, prevent replay duplicates and retain edited snapshots. The original timestamp and email identify versions; earlier versions are superseded when edited. Identical timestamp/email collisions cannot be distinguished. Deleting Google rows does not delete TMS history.

Retries use a script lock and a rotating cursor within a four-minute execution budget. Successful photos are skipped on replay. Atomic per-file updates prevent lost photo status; unique photo constraints prevent duplicate records. Sheet `_TMS Status`, `_TMS Error`, and `_TMS Hash` columns show forwarding status. TMS records the last received submission and import errors. The backend `pretrip_form_sync.enabled` setting controls receipt; the setup/status panel is removed from the report.

The token is stored only as SHA-256 in a private RLS table. The rotation RPC checks the authenticated admin/manager role and returns the plaintext once. The Edge Function requires this token before any data is accepted; only backend code uses the Supabase service key. No Google credentials are sent to TMS. Token-free templates are safe to commit; generated scripts are private credentials.

## Validation and remaining setup

Mapping and UI tests: `npx vitest run src/lib/googlePretripMapping.test.ts src/components/PretripFormSubmissions.test.tsx`. Also run `npm run typecheck` and `npm run build`. Database rollback checks verify duplicate rejection, write restrictions, and per-file progress. The live receiver must reject missing/invalid tokens.

The backend and TMS setup UI can be deployed independently. The integration is not active until the form owner links a response sheet and runs the Google script. A real Google submission and private-photo transfer must then be verified. The uploaded Excel export confirms the column labels but does not grant access to its linked photo bytes.

## Current response sheet

Source: `1XhvVxfi2g_cYQUJfZiAgBORbl8ciqwKFkTebBlVunBQ`, tab `Form Responses 1`. Its driver column is `Driver name and last name`, and it has no separate inspection-date question. The bridge supplies the submission timestamp’s Chicago calendar date as the inspection date. All comma-separated file IDs are preserved in their original photo categories; do not split these into unnamed columns. Google OAuth approval and an actual private-photo transfer must be verified before claiming the new connection is active.

Live verification on 2026-10-07: truck 4662’s response imported all 26 submitted photos across all eight categories. Two transient failures succeeded on replay without duplicate photo records. Submission status is `imported` with no import error.
