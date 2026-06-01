## Truck Sales — split by truck company

Rework `/truck-sales` to mirror the styling of the Analytics "Other Salaries" tab (Card + `Table` with `table-fixed` and absolute pixel widths), grouped into one section per truck-owning company (`trucks.company_id`). Trucks without a company go under an "Unassigned" section.

### Database

Add the missing fields on `public.trucks` (existing: `truck_number`, `model`). New columns:

| Column | Type | Notes |
|---|---|---|
| `make` | text | nullable |
| `transmission` | text | nullable (e.g. Automatic / Manual) |
| `year` | int | nullable |
| `miles` | int | odometer reading, nullable |
| `engine` | text | nullable |
| `has_apu_webasto` | boolean | default false |
| `has_inverter` | boolean | default false |
| `has_fridge` | boolean | default false |
| `sale_price_week` | numeric(10,2) | nullable |
| `sale_terms` | text | nullable, free-form |

Migration also re-asserts GRANTs already present on `public.trucks` for any new dependent operations — no RLS policy changes (existing trucks policies cover read/update for the involved roles).

### Page rewrite — `src/pages/TruckSales.tsx`

- Fetch `trucks` (active only) joined with `companies(name)` and `driver1:drivers!driver1_id(first_name,last_name)`.
- Group rows by `company_id`; sort companies alphabetically; render one Card per company with the company name as the header and a truck count.
- Inside each Card, render a `Table` with `table-fixed` and these columns (absolute widths, mirroring Other Salaries):
  - Truck # · Make · Model · Transmission · Year · Miles · Engine · APU/Webasto · Inverter · Fridge · Driver · Price/week · Terms
- Equipment flags render as Yes/No badges (green/muted). Driver name = `driver1` full name or em-dash. Price formatted as USD currency. Miles formatted with thousands separators.
- Inline editing for users with role `admin`, `manager`, `chicago_management`, or `recruiting`:
  - Text fields (make, model, transmission, engine, terms): click-to-edit input
  - Numeric (year, miles, sale_price_week): numeric input
  - Booleans (apu_webasto, inverter, fridge): toggle switch
  - On blur / toggle change → `supabase.from('trucks').update(...)` + optimistic React Query cache patch, then invalidate
- Read-only roles see the same grid without inputs (plain text + Yes/No badges).
- Empty company sections are not rendered.

### Out of scope

- No sidebar/route changes (page + role gating already in place).
- No file uploads or sales workflow beyond price/terms fields.
- No edits to Analytics or Other Salaries.

### Technical notes

- Group-by uses `trucks.company_id` (per user choice), not `driver1.company_id` — the "truck company source" memory applies to display elsewhere, not to ownership-based sales grouping.
- Follow Table layout standard (`table-fixed` + px widths) and design tokens only.
- Use existing `useAuth` `hasRole` for edit gating.
