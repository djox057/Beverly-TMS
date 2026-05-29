## Goal
Show a history of every company a driver has driven for, displayed as tenure cards inside the existing Assignment History dialog (driver mode).

## Database

New table `public.driver_company_history`:
- `id uuid pk`
- `driver_id uuid not null` (fk drivers)
- `company_id uuid` (fk companies, nullable for "no company")
- `company_name_snapshot text` (preserves name even if company is renamed/deleted)
- `started_at timestamptz not null default now()`
- `ended_at timestamptz` (null = current)
- `changed_by uuid` (auth user)
- `changed_by_name_snapshot text`

Plus standard GRANTs (anon SELECT for read, authenticated SELECT, service_role ALL), RLS enabled, SELECT policy = anyone authenticated/anon (mirroring how assignment history is exposed).

### Trigger `log_driver_company_change` on `drivers` AFTER UPDATE OF company_id:
- When `OLD.company_id IS DISTINCT FROM NEW.company_id`:
  - Close the open row for that driver (set `ended_at = now()`).
  - Insert a new open row with `NEW.company_id` + snapshot of company name + `auth.uid()` + name snapshot.
- AFTER INSERT on `drivers`: if `company_id` is not null, insert one open row (so new drivers get a starting entry).

### Seed for existing drivers
One-time backfill: for every existing driver with a `company_id` and no history row, insert a single open row with `started_at = COALESCE(hire_date, drivers.created_at)`, no `changed_by`. No prior companies are reconstructed (per "track going forward only").

## Frontend

### New hook `useDriverCompanyHistory(driverId)`
Fetches rows from `driver_company_history` ordered by `started_at desc`, joining `companies` for current name (falls back to `company_name_snapshot`).

### `AssignmentHistoryDialog.tsx` (driver mode)
- Change the `TabsList` from `grid-cols-3` to `grid-cols-4`.
- Add a fourth tab `Companies` after `Dispatcher`.
- Render a list of `TenureCard`-style entries using the existing card UI. New `entityType: 'company'` support in `TenureCard` (Building2 icon, "No company assigned" empty label).
- Each entry shows: company name, date range (`started_at` → `ended_at` or "Current"), duration, and "Assigned by" when available. No edit/delete controls — read-only.

### `TenureCard` / `tenureCalculator`
- Extend the `entityType` union to include `'company'`.
- Add `Building2` icon mapping.
- A small adapter in the dialog converts `driver_company_history` rows into the `Tenure` shape the card already expects (no need to extend `calculateTenures` — rows are already pre-computed tenures).

## Out of scope
- No backfill of past companies from `assignment_history` / trucks.
- No manual editing UI.
- No changes to the driver edit dialog or driver list view.

## Files touched
- New migration: table + GRANTs + RLS + policies + trigger + backfill.
- `src/hooks/useDriverCompanyHistory.ts` (new).
- `src/components/AssignmentHistoryDialog.tsx` (add tab).
- `src/components/TenureCard.tsx` (add `'company'` to entityType + icon).
