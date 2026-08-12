# Dispatcher Reportings in Drivers Complaints

Adds a third page to Drivers Complaints called **Dispatcher Reportings**, opens the page up to the `dispatch` role (restricted to their own reportings only), and introduces a two-record workflow so managers can categorize a dispatcher's report without the dispatcher losing sight of it.

## Pages / groups

```text
Page 1: HOS · Gross/RPM · Dispatcher · Recruiting
Page 2: Accounting · Maintenance · Trucks · Other
Page 3: Dispatcher Reportings          <- new, single wide card
```

Header chevrons cycle through all three pages, keeping the current slide animation and the selected week.

## Who sees what

- **Admin / manager**: all three pages, full create/edit/delete/resolve/comment, plus the ability to assign a category to a dispatcher reporting.
- **Dispatch**: sidebar entry and page become visible, but the page opens locked on Dispatcher Reportings — no group chevrons, no other categories. They see only reportings they created themselves, can add new ones, and can comment on their own.
- All other roles: unchanged (no access).

## Workflow

1. A dispatcher adds a reporting (truck/driver + text). It lands on the Dispatcher Reportings page as type `dispatcher_reporting`.
2. Admin/manager open that reporting and pick a category (HOS, Gross/RPM, Dispatcher, Recruiting, Accounting, Maintenance, Trucks, Other). This creates a **linked copy** in the chosen category card, carrying over subject, text, driver/truck, and the original author name and timestamp.
3. The dispatcher keeps seeing their original entry on Dispatcher Reportings, untouched. The copy is manager-side only.
4. The copy shows a small "From dispatcher reporting" marker and can be resolved / edited / deleted independently. Resolving the copy also marks the original reporting resolved so the dispatcher sees the outcome.
5. Re-assigning changes the copy's category rather than creating a second copy.

## Search behaviour

- Admin/manager search: shows assigned copies plus any reportings that have not been categorized yet — never both halves of the same pair (the original is hidden once a copy exists).
- Dispatch search: only their own dispatcher reportings, all dates, grouped by day like today.

## Comments

- Comments a dispatcher leaves on their reporting are shown on the manager-side copy as a read-only **Dispatcher comments** block.
- Comments admins/managers leave on the copy are a separate internal thread and are never shown to the dispatcher.
- Dispatchers can delete only their own comments.

## Technical notes

Database migration:
- New complaint type value `dispatcher_reporting`.
- `driver_complaints` gains `source_complaint_id uuid` (self FK, nullable) marking a manager-side copy, and `assigned_complaint_id uuid` on the original for the reverse pointer (or a single self-referencing column plus lookup — one column `source_complaint_id` with an index is enough; the reverse is derived).
- RLS additions on `driver_complaints`: `dispatch` may select and insert rows where `created_by = auth.uid() AND complaint_type = 'dispatcher_reporting' AND source_complaint_id IS NULL`; update/delete limited to their own unassigned reportings.
- RLS additions on `driver_complaint_comments`: `dispatch` may select and insert comments on complaints they own, and delete their own comments. Existing admin/manager policies stay.
- Grants: `authenticated` + `service_role` only (no `anon`).

Frontend:
- `complaintTypes.ts`: add `dispatcher_reporting` key/label and a third group entry.
- `DriversComplaints.tsx`: role-aware group list (dispatch locked to page 3), role-aware query filter, search results scoped by role and de-duplicated by pair.
- `ComplaintCard.tsx`: dispatch gets add + comment on the reportings card only; new "Assign category" control for admin/manager on reportings; copies render the origin marker.
- New `AssignComplaintTypeDialog.tsx` for picking the category and creating/updating the linked copy.
- `ComplaintComments.tsx`: `canComment` extended to dispatch for their own complaints; new read-only mode used to render dispatcher comments on the copy.
- `Sidebar.tsx`, `App.tsx`: allow `dispatch` on the entry and the route guard.
