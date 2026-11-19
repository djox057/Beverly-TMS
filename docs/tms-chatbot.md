# TMS assistant

Read-only, opt-in staff assistant for drivers, trucks, trailers, companies, individual orders, document retrieval, and published FAQ. The floating panel persists across navigation within the current tab. There is no saved chat history, document reading/OCR, web search, record mutation, email sending, analytics, or financial aggregation.

## Access and setup

- Admin Users → edit user → **Chatbot access** → save. Everyone, including administrators, requires the toggle for normal chat and file downloads. All toggles start disabled.
- Admin Users → **Assistant FAQ & document access** manages published answers and per-file review. These controls require the actual admin role on the server/RLS; client role inheritance cannot grant access.
- Reuses the existing server-side `GEMINI_API_KEY`. Model: `gemini-flash-lite-latest`; minimal thinking, JSON classification, bounded output, 12-second provider timeout. There is no silent switch to a larger model.
- Backend: `tms-chatbot`, with gateway JWT validation plus `auth.getUser()` and fresh database permission checks. Migrations create isolated chatbot access/FAQ/document-review/counter tables; they do not widen the existing TMS table or Storage policies.
- Normal chatbot users receive broader read-only documents through this endpoint. Existing application-page and editing permissions remain authoritative for the linked TMS page.

## Security boundary

Gemini receives the current question, up to six recent user questions (500 characters each, oldest first), current record type/UUID, fixed task/field definitions, and generic translation instructions. Restricted prior questions are omitted. Recent questions resolve follow-ups and omitted identifiers/document types; the latest question and current record context take precedence. Clear chat and account/access changes reset this in-memory history. FAQ answers, private record results and file contents are never sent. It receives no retrieved record values, financial amounts, files, signed URLs, account credentials, or assistant response transcript. User-supplied messages may themselves contain personal information; staff should not paste secrets.

The server selects named fields for each finite tool. There is no model-generated SQL, table name, column expression, arbitrary HTTP request, dynamic RPC, or arbitrary model answer. Driver salaries/CPM, dispatcher profile percentages, payroll, performance, bank details, secrets and all internal notes/comments are absent from these projections. Company details use JSON-path projections for MC/DOT/phone/address rather than fetching the credentials JSON.

Only `freight_amount` and `driver_price` of **one uniquely resolved order** can be displayed. Currency values are inserted by server templates and never returned to Gemini. There is no totals/averages/ranking endpoint, multi-order rates response, or arithmetic tool. Ambiguous identities require user selection, validated against the original result set. Users can still manually add values they are allowed to read individually.

Private file links are issued only after reloading canonical metadata, checking current access, category/review, record ownership, and path. The client supplies IDs, never a trusted bucket or path. Links expire after 60 seconds. COI documents use their canonical company ownership and the existing `company-coi` bucket.

Known classified documents such as CDL, medical card, registration/cab card, inspection, COI, RC/BOL/POD are available unless explicitly hidden. Generic scans, applications, agreements and unknown types require admin review. Restricted salary/payroll/banking/credential/internal-note metadata overrides an approval. Retrieval-only cannot inspect incorrectly classified file contents; admins must classify/review mixed documents accordingly. At most 500 file metadata rows per record (plus 100 company COIs) are returned, newest first. No files are downloaded to or processed by the model.

## Request mapping

All requests are authenticated POSTs to `/functions/v1/tms-chatbot`.

| Action | Input | Scope and output |
| --- | --- | --- |
| `access` | none | Current user's enabled state and actual admin status |
| `chat` | message, optional history/context/selection | Finite lookup; approved facts, choices, file metadata, links, manual steps |
| `file` | kind, recordId, fileId, download | Reauthorized 60-second document URL |
| `review_files` | kind, query | Admin only; bounded metadata for one resolved record |
| `review_file` | kind, fileId, allowed | Admin only; record explicit allow/hide review |

| Kind | Source | Exclusions |
| --- | --- | --- |
| Driver | Selected identity, contacts, CDL/expiration, license endorsements | Pay arrangements, comments/notes, performance |
| Truck/trailer | Selected vehicle identity, VIN/plate, status, inspection/maintenance dates/mileage | Internal notes, comments, free-form snapshots |
| Order | Selected identifiers/status/dates/commodity/miles; optionally two per-load amounts | All notes/comments, dispatcher aggregates, cross-order rates |
| Company | Company name; projected MC/DOT/phone/address | Passwords, banking, credential objects |
| Files | Canonical metadata in driver/truck/trailer/order/company/COI file tables | Restricted or unreviewed ambiguous documents |
| FAQ | Explicitly published question/answer/keywords/page path | Private notes and restricted content |

## Speed, cache, and monitoring

Intent/localization cache uses a SHA-256 key scoped to user/message/context/history, five-minute TTL, at most 300 entries per warm function instance. There is no persistent message or private result cache. Record/file/FAQ data is fetched fresh; permission changes and file replacement do not wait for cached answers to expire. Static prompt prefix allows provider implicit caching when eligible; there is no paid explicit cache allocation.

Request counters are atomic and service-role-only: 30 requests/minute and 400/day per user, including file actions. Logs contain only model/version, token/cache usage, provider latency, and generic failure type. They omit user IDs, messages, record data, file data, tokens and URLs. Inspect `chatbot_usage` events to validate real latency and cost before widening access. The 1–3 second target is not a measured guarantee.

FAQ supports optional saved Serbian and other language answers authored by admins; missing translations fall back to the original saved answer. FAQ content never goes to Gemini. Generic UI/result labels are localized by the classifier. Proper addresses and identifiers are preserved. TMS tab labels stay in English to match the actual UI.

## Validation and release

- `node --test scripts/tests/tms-chatbot.test.mjs`: 29 server/policy tests with mocked Auth, database, Storage and Gemini; unauthorized/disabled access, field exclusion, bank/payroll denial, per-load scope, ambiguity, file revocation, COI ownership, cache freshness, malformed/provider errors.
- `npm test -- --run src/components/ChatbotPanel.test.tsx src/hooks/useChatRecord.test.tsx`: 9 panel/navigation tests.
- `NODE_OPTIONS=--max-old-space-size=8192 npm run build`: production build. The existing scanner dependency exceeds the default Node heap during this repository's build.
- Function and policy pass a separate strict TypeScript check. Full repository typecheck has existing duplicate RPC declarations and a truck `fleet_service_snapshot` insert-type error, also reproduced on unchanged main.
- All four new tables have RLS. Anonymous grants are explicitly revoked; authenticated users cannot modify counters or invoke the counter function. Security advisors show no chatbot-specific findings.
- Backend migrations/function deployed with all chatbot toggles disabled. A real authenticated user/Gemini end-to-end check remains necessary before staff rollout. Automatic review rejected a temporary diagnostic before user authentication and a proposal to send FAQ answers for translation. Neither was deployed; the final function retains authentication and sends no stored content to Gemini.
- Pilot with a few explicitly enabled staff users. Check yard address, a driver CDL front/back plus fields, a truck cab card, company COI, one load's amounts, blocked salary/totals/notes, access revocation, and manual/page links.
- Kill switch: disable all `chatbot_access.enabled` values. To roll back the UI, revert the feature commit; inactive backend tables can remain. Do not delete existing operational records or files.

## Navigation and related vehicle documents

Navigation requests use a reviewed page catalog with actual TMS routes and short manual steps. Common English/Serbian questions (including "gde da updejtam oil change za kamione") resolve without a provider call. Other wording uses the model's finite `navigate` intent/page ID. Links and instructions come from the server catalog; page role gates remain in force. Oil-change instructions point to Live Oil Change → select truck → Add log entry → Oil Change → Save entry. Dispatch/supervisor users receive the existing Mileage Check-only limitation. No task is executed on behalf of the user.

A cab card requested by driver name resolves current `trucks.driver1_id`/`driver2_id` assignments and searches `truck_files`, never driver files. The response explains that it is a truck document and links to the actual truck's files. Missing assignments are reported explicitly; ambiguous drivers/trucks require validated selection. Cab-card matching excludes Registration Affirmation. Saved CDL details are not included in a cab-card response. Service-log URLs also establish the current truck context.
