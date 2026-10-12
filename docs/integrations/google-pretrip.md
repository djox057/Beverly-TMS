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

## Photo reuse warnings

Original photo bytes are fingerprinted with SHA-256 in both `receive-pretrip-form` and manual TMS uploads. `get_pretrip_photo_reuse(date)` compares the selected Chicago Monday–Sunday week with all earlier inspection weeks, including other units visible to the viewer. The same Google file ID also matches while fingerprints are pending. New names or Google IDs do not prevent a content match. Same-week repeats, future weeks and superseded form versions are excluded. Warnings are informational and do not change the imported status, weekly completion or reviewer checkmark.

The Pictures cell shows an amber warning per affected form. Its tooltip and the selected photo's gallery banner identify the earlier inspection date, unit and original form driver when available. Manual historical uploads have no original driver snapshot and show the unit/date. A failed comparison preserves the gallery and reports that checking is unavailable. Unfingerprinted photos show a pending message. Edited, cropped, reencoded or screenshot copies are outside exact-file matching.

| Operation | Input | Authentication | Output / consumer |
|---|---|---|---|
| Existing photo receipt | Original image bytes | Existing Google bridge token | `pretrip_photos.content_sha256` |
| Existing manual upload | Original image bytes | Existing signed-in upload policy | `pretrip_photos.content_sha256` |
| `rpc/get_pretrip_photo_reuse` | Selected inspection week | Authenticated, security invoker; existing RLS | Earlier photo/date/driver/unit; Pictures warnings |
| `functions/v1/backfill-pretrip-photo-hashes` | Empty POST | Backend-only `CRON_SECRET` | Up to 40 original stored images per run; processed/failed counts |

The backfill downloads only signed URLs generated for recorded private Storage paths, with four concurrent reads, 15-second request timeouts and a 55-second batch budget. Failed files rotate to the end for retry. This endpoint is invoked manually for a one-time historical backfill; there is no scheduled job. No Google credentials or service keys are exposed. Stop invoking the backfill endpoint to pause it; normal upload hashing remains active. Frontend rollback can remove warnings without deleting photo history or fingerprints.

Validation on 2026-10-12: 20 focused pretrip tests, TypeScript checks and the production build passed. Rolled-back SQL fixtures verified Sunday/Monday boundaries, renamed reuploads, Google-ID fallback, same-week/future/superseded exclusions and RLS denial for an unauthorized caller. Both deployed functions reject missing credentials with HTTP 401. The one-time backfill finished without failures: all 392 existing photos have fingerprints, with zero pending. The current-week query identifies 22 earlier-week matches. Database, receiver and warning UI changes are published.

## Photo import validation and precise failures

The receiver detects JPEG, PNG, GIF, WebP, BMP, TIFF, HEIC and AVIF from their file signatures when Google sends a missing or incorrect MIME label. It uploads the unchanged original bytes with the detected image MIME type, so original SHA-256 comparisons remain valid. Other formats already carrying an image MIME type retain their existing behavior. Empty files, non-images with generic types, videos and files exceeding 10 MiB produce specific errors; the upload limit remains the same.

Photo failures are recorded immediately through `update_pretrip_form_file` with `error_source = 'tms'`. A generic follow-up from an older Google bridge cannot overwrite this precise error or downgrade an already imported photo. A successful retry clears the error and its source. The source template now forwards a bounded error message with URLs removed. Existing installed Google scripts benefit from server-side validation and error preservation without replacement.

The authenticated transport entrypoint delegates to a testable receiver. Tests exercise a multipart JPEG labeled `application/octet-stream`, original-byte fingerprints, Storage failures and recovery, stale generic error reports, invalid credentials, known photo signatures, non-image rejection and the unchanged size limit. No additional database permissions or scheduled jobs are introduced.

For previously failed uploads, run `retryPretripSubmissions` from the response sheet's owner-authorized Apps Script. Imported images are skipped; only pending/error files are forwarded again. The connected Drive account must have access to the form's private uploaded files. The generic old error cannot reveal the exact original rejection retrospectively; a real retry will either import the photo or retain the new precise reason.

Import fix validation on 2026-10-12: 29 focused tests, TypeScript checks and the production build passed. Live receiver version 11 imported 42 new photos after deployment. The existing 11 failed files for units 2154, 5821 and 5872 still had their old attempt times; recovery awaits a retry by the owner-authorized Google bridge. Unit 2131 is outside this fix.

## Latest daily response and video uploads

Only the latest submission for each truck and inspection date is visible in Form details, Pictures, complaints and weekly completion. Other inspection days remain separate. Original submissions and files are retained in the database. A later incomplete response stays visible instead of falling back to an older complete one. Submission time determines the latest response, with sheet row and creation time as deterministic tie breakers; file order does not affect selection. The form query is paginated so a busy week cannot lose the latest response beyond the first 1,000 rows. Photo queries use the latest visible form IDs while retaining manual uploads.

The remaining rejected uploads were actual `video/quicktime` and `video/mp4` clips. The receiver accepts MOV/MP4 and declared WebM uploads under the existing 10 MiB limit, retaining original bytes and fingerprints. `pretrip_photos.content_type` and the form's file metadata identify the media type. Both galleries use a video player for clips, with controls and inline playback; photo rendering remains unchanged. The Pictures gallery provides a download fallback when a browser lacks the clip's codec. New manual uploads can also select these video formats.

Receiver version 13 and the metadata migration are deployed. Live verification: units 2154 (9/9), 5821 (8/8), 5872 (8/8) and 4280 (13/13) are fully imported with no remaining errors, including all 12 previously rejected video files. Both 3528 forms contain the same set of 14 image fingerprints; only the later 08:23 response is visible under the daily selection rule. Rollback can restore the previous frontend and receiver while retaining the additive media metadata and all historical files. No permissions or scheduled jobs changed.

Validation: 52 focused tests passed across the updated pretrip helpers, transport, galleries, completion and page coverage; TypeScript checks and the production build passed. The original 14-photo records for both 3528 responses remain in the database, while the UI selects only the later response.
