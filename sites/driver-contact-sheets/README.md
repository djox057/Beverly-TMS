# Beverly Driver Contact Sheets

Standalone, buildless website intended for a **new private Sites project**. All application source is under this directory. It is separate from the TMS application.

## Current state

- Source prepared on `codex/driver-contact-sheets-site`; no TMS application files or production database records changed.
- **Not published. No Sites project has been registered.** The current conversation has no executor, filesystem, Git checkout, browser, or packaging environment. The Sites connector requires pushed source in its own source repository before saving or deploying a version. A GitHub commit is not a Sites deployment.
- Company layouts are recreated as editable HTML/CSS, with text wordmarks in company colors. The exact uploaded logo artwork is **not embedded yet**, because the attached local files could not be processed without an executor. A PNG/JPEG/WebP logo can be added per sheet in the UI. Integrate the supplied brand artwork before treating the visual match as complete.
- Mapping tests ran in the available JavaScript runtime: 13 passed. Application JavaScript syntax was parsed successfully. Browser, auth, REST projection, responsive layout, and physical printing remain unverified.

## Behavior

1. Sign in with an existing Beverly TMS staff account.
2. Search/select a driver by name, company, truck, or dispatcher.
3. Fill the company from `drivers.company_id` and the primary dispatcher from `drivers.dispatcher_id`.
4. Include linked supervisors through `dispatcher_supervisors`, deduplicated by `profiles.user_id`.
5. Show the current dispatcher alias (after a hyphen in TMS names), extension, and optional direct phone.
6. Add extra contacts from TMS and adjust per-sheet contact/company/department values.
7. Choose Classic or Branded, US Letter or A4.
8. Print the single-page contact sheet or save it as PDF in the browser print dialog.

The driver record is authoritative. If the truck's company or dispatcher differs, the app displays a warning and keeps the driver's assignment. Driver 2 on team trucks is supported. No fallback to previous dispatchers is made.

All 377 active drivers in the inspected production database had both company and dispatcher IDs at inspection time. This is a finding, not a bundled driver snapshot.

Printing is blocked for missing company/authority numbers, missing contact numbers, excessive contacts, measured overflow, failed refresh, or data older than five minutes. A refresh resets sheet edits to current TMS values. The app fetches a session snapshot; it does not claim real-time subscriptions.

## Source of each field

| Sheet field | Source |
| --- | --- |
| Driver name / active state | `drivers.name, is_active` |
| Company | `drivers.company_id -> companies.id` |
| Assigned dispatcher | `drivers.dispatcher_id -> profiles.user_id` |
| Contact alias / extension / phone | `profiles.full_name, ext, phone_number` |
| Supervisors | `dispatcher_supervisors.dispatcher_id -> supervisor_id` |
| Truck label | `trucks.driver1_id OR driver2_id`; preserve string truck numbers |
| MC, DOT, office phone, mailing address | Projected scalar fields of `company_info_credentials.credentials` |
| Brand colors, public department emails, general department numbers, afterhours | Supplied reference sheets, editable on the generated sheet |
| Beverly Group and BF Prime United authority details | Reference-sheet fallback; TMS has no company contact-profile row for these two |
| Exact logos | Pending asset integration; optional per-sheet image upload currently supported |

Live TMS company details differ from several older reference sheets. TMS values win where present. The app deliberately uses the public dispatch email from the reference domain, rather than a mailbox login such as `dispatch.old@...`. It never selects mailbox usernames/passwords.

## Access and data safety

- Configured for the existing FleetCarrier TMS project `wjkbtagwgjniilmgwutb`.
- Uses an active **publishable** browser API key, never a service key.
- Uses TMS password authentication and existing RLS; no RLS or grant changes.
- Allowed staff roles mirror existing TMS driver access.
- Queries only driver identity/assignment, company names, staff contact fields, supervisor links, truck assignments, and non-secret company-contact scalars.
- Company selection is explicitly `company_name,mc:credentials->>mc,dot:credentials->>dot,phone:credentials->>phone,address:credentials->>address`. The credentials object, email login, and passwords are never requested.
- Auth is isolated to this app's sessionStorage key. Driver/contact data, logos and edits stay in memory. Sign-out clears them.
- There are no database insert/update/delete/upsert/RPC calls. Authentication/sign-out are the only account mutations.
- Existing broad RLS rules are preserved; this app does not tighten or widen TMS row visibility.

## Validation commands in an executor

From this directory:

```sh
npm run check
npm test
```

The app needs no package installation or build. Supabase JS is loaded from the pinned CDN URL `@supabase/supabase-js@2.78.0`. It is an external runtime dependency and should be vendored or bundled if offline availability is needed.

Before publication, verify an authorized and unauthorized TMS session, expiry/sign-out during an in-flight read, safe JSON scalar projection, primary + team-driver selection, both paper sizes, long company/address/contact values, stale-data printing guard, and every company template in a real browser.

## Complete Sites deployment when an executor is available

1. Read the current Sites skill and use a **new empty checkout**. Copy only this project's source, excluding this parent repository's Git metadata and all TMS files.
2. Register a new private Site titled `Beverly Driver Contact Sheets`. Persist its returned exact `project_id` in `.openai/hosting.json` with `static.directory: "dist"`. Do not guess a project ID or deployment URL.
3. Add the exact attached logo artwork as local assets and map it to company IDs. Inspect the images before cropping.
4. Complete browser QA and the checks above.
5. Use the Sites source helper to push to the Site's own source repository and package the static output from that same commit.
6. Save and deploy through the private Sites flow using the helper's actual commit SHA/archive. Keep the default private audience.
7. Report the returned production URL and actual deployment state.

Do not pass this parent GitHub commit as the Site's `commit_sha`: it is not a commit in a configured Sites source repository.
