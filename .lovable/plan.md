## Goal

Provide a reusable Python script that reads `Copy of Truck Sales .xlsx` (or any sheet with the same column layout) and emits SQL `UPDATE` statements you can paste into the Supabase SQL editor — for trucks (specs + APU/Inverter/Fridge flags) and for the assigned driver (weekly_payment + weeks_count).

## Deliverable

A single file: `scripts/truck_sales_to_sql.py`

Usage:
```
python scripts/truck_sales_to_sql.py "Copy of Truck Sales .xlsx" > backfill.sql
```

Optional flags:
- `--sheet "Beverly Freight"` — pick a specific sheet (default: first sheet)
- `--no-drivers` — skip driver UPDATEs, emit truck UPDATEs only
- `--no-trucks` — skip truck UPDATEs, emit driver UPDATEs only

## Column mapping (spreadsheet → DB)

| Sheet column | Target | Normalization |
|---|---|---|
| Truck # (col A) | `trucks.truck_number` (match key) | trim, strip trailing `.0` from numeric values, keep as text |
| Make | `trucks.make` | trim, collapse spaces, UPPERCASE |
| Model | `trucks.model` | trim, collapse spaces, UPPERCASE, strip trailing `.0` |
| Transmission | `trucks.transmission` | anything containing "auto" → `Automatic` |
| YEAR | `trucks.year` | integer; blank → `NULL` |
| Miles | `trucks.miles` | integer; blank → `NULL` |
| Engine | `trucks.engine` | trim, collapse spaces, UPPERCASE |
| APU / WEBASTO | `trucks.has_apu_webasto` | `NO`/`/`/blank → false, else true |
| INVERTER | `trucks.has_inverter` | same rule |
| FRIDGE | `trucks.has_fridge` | same rule |
| Price (week) | `drivers.weekly_payment` (via `trucks.driver1_id`) | numeric; `/` or blank → skip |
| Terms | `drivers.weeks_count` (via `trucks.driver1_id`) | parse `Ny Mm` → `N*52 + round(M*52/12)` weeks; `/` or blank → skip |

Driver Name, Insurance, Notes are ignored (driver assignment is handled elsewhere; insurance/notes have no matching columns).

## SQL output shape

For each non-empty data row:

```sql
UPDATE trucks
SET make='…', model='…', transmission='…', year=…, miles=…, engine='…',
    has_apu_webasto=…, has_inverter=…, has_fridge=…
WHERE truck_number='…';

UPDATE drivers
SET weekly_payment=…, weeks_count=…
WHERE id = (SELECT driver1_id FROM trucks WHERE truck_number='…')
  AND id IS NOT NULL;
```

Single-quotes inside values are escaped (`'` → `''`). Empty/marker rows (e.g. "ONLY NEW UNITS", fully blank rows) are skipped.

## Technical notes

- Dependency: `openpyxl` only (`python -m pip install openpyxl`).
- Header row is row 1; data starts at row 2.
- Script is pure stdout — no DB connection — so it's safe to review the SQL before running.
- Output is deterministic in sheet order so diffs are reviewable.
