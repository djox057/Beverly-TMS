

## Turnover List Page

### Overview
Build the Turnover List page as a dispatcher-focused table showing how many drivers became inactive under each dispatcher within a selected date range, with termination note explanations.

### Data Model
- **Drivers table**: `is_active`, `termination_date`, `last_dispatcher_id`, `name`
- **driver_termination_notes**: `driver_id`, `note`, `created_at`
- **Profiles**: `user_id`, `full_name`, `office`
- No new tables or migrations needed -- all data already exists.

### UI Layout

**Filters bar** (matching Analytics pattern):
- Date range picker (DateRangePicker component)
- Office toggle buttons (fetched from profiles, excluding "Recovery")

**Table columns**:
1. **Dispatcher Name** -- full name from profiles
2. **Turnovers** -- count of inactive drivers whose `last_dispatcher_id` matches and `termination_date` falls within the date range
3. **Explanation** -- 2 rows high per dispatcher; shows truncated termination notes of the drivers who quit. If text overflows, shows "..." which opens a dialog.

**Row layout**: Each dispatcher row is visually 2 rows tall. The first sub-row has name + turnover count. The explanation cell spans both sub-rows, showing concatenated driver names + notes, truncated with "..." link.

**Dialog on "..." click**: Opens a dialog listing all terminated drivers for that dispatcher in the date range, with columns: Driver Name, Termination Date, Termination Note.

### Data Flow
1. Fetch all profiles + user_roles to identify dispatchers (roles containing 'dispatch' or 'afterhours')
2. Query `drivers` where `is_active = false`, `last_dispatcher_id IS NOT NULL`, `termination_date` within range
3. For each terminated driver, fetch `driver_termination_notes`
4. Group by `last_dispatcher_id`, count turnovers, collect notes
5. Filter by selected offices using dispatcher profile office
6. Sort by turnover count descending by default

### Files Changed
- `src/pages/TurnoverList.tsx` -- complete rewrite with table, filters, dialog

### Technical Details
- Uses `useQuery` from tanstack for data fetching
- Fetches terminated drivers with their termination notes in a single query using Supabase join: `drivers` + `driver_termination_notes`
- Office filter buttons use same pattern as Analytics
- Default sort: turnovers descending
- Sortable columns: name (alpha), turnovers (numeric)

