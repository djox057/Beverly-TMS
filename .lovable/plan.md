# Drivers Complaints page

A new page for logging and tracking complaints about drivers, laid out like Yard Arrivals: complaint categories as columns of cards, each with its own "add" button, a top search bar, and a comment thread on every complaint.

## Navigation

- New item "Drivers Complaints" in the sidebar, directly below "Dispatcher Performance".
- Visible only to `admin` and `manager` (strict role check, same pattern the Dispatcher Performance entry already uses).
- Route `/drivers-complaints`, guarded so a direct URL visit by any other role is blocked.

## Layout

8 complaint types, shown 4 at a time to keep columns wide enough:

```text
[ Group 1 ] [ Group 2 ]          <- toggle between the two sets
+--------+ +--------+ +--------+ +--------+
| HOS  + | |GROSS/  | |Dispat. | |Recrui. |
|        | |RPM   + | |      + | |      + |
+--------+ +--------+ +--------+ +--------+
```

- Group 1: HOS, GROSS/RPM, Dispatcher, Recruiting
- Group 2: Accounting, Maintenance, Trucks, Other
- Each card header shows the type name, a live count, and a `+` button.
- Cards list complaints newest first, grouped by day like Yard Arrivals.
- Each complaint row shows truck # / driver name, the complaint text, who created it, when (Chicago time), edit + delete buttons, and a collapsible comment thread.

## Adding a complaint

Clicking `+` on a card opens a dialog pre-set to that type with:
- Truck number / driver name (free-text field with suggestions from existing trucks and drivers, so it works even for people not yet in the system)
- Complaint text
- Optional: mark resolved later from the card

Only `admin` and `manager` can create, edit, delete, or comment.

## Search

Single search bar at the top of the page, same look and behaviour as Yard Arrivals: filters all visible cards by truck number, driver name, or complaint text.

## Technical notes

New table `public.driver_complaints`:
- `complaint_type` (text, constrained to the 8 values), `driver_id` (nullable FK to drivers), `truck_id` (nullable FK to trucks), `subject_text` (typed truck/driver text as entered), `content` (complaint body), `is_resolved` (bool, default false), `resolved_at`, `created_by`, `created_by_name`, `created_at`, `updated_at` + updated_at trigger.

New table `public.driver_complaint_comments`:
- `complaint_id` FK, `content`, `author_id`, `author_name`, `created_at`.

Grants and RLS on both: `GRANT` to `authenticated` and `service_role` only (no `anon`); all policies restricted to `has_any_role(ARRAY['admin','manager'])`, with comment deletion also allowed for the comment's own author.

New files:
- `src/pages/DriversComplaints.tsx` — page, search, 4+4 group toggle, cards.
- `src/components/complaints/ComplaintCard.tsx` — one type column.
- `src/components/complaints/AddComplaintDialog.tsx` — create/edit form.
- `src/components/complaints/ComplaintComments.tsx` — thread, modeled on `YardActionComments`.

Edited files: `src/components/Sidebar.tsx` (nav entry), `src/App.tsx` (route).
