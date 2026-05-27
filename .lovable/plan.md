## Daily Report — new page

A standalone page that replicates the Beverly Daily Report xlsx as editable tables in the app. **UI only — no database changes, no save yet.** Entries reset on reload.

### Routing & navigation
- New route `/daily-report` registered in `src/App.tsx`, wrapped in `ProtectedRoute` with the same role gate as Home time (`supervisor`, `manager`, `admin`).
- New sidebar entry **"Daily Report"** in `src/components/Sidebar.tsx`, inserted directly below the "Home time" (`/problems`) link, using the same role gate and a calendar/clipboard icon.

### Page structure (`src/pages/DailyReport.tsx`)
Header bar:
- Title "Beverly Daily Report"
- Date picker (shadcn `Calendar` in a `Popover`, defaulting to today in Chicago time) — purely cosmetic since nothing is persisted, but matches the xlsx DATE field and the requested behavior.

Tabs (shadcn `Tabs`, styled like Reports' office tabs):
1. **CACAK**
2. **KRAGUJEVAC**
3. **BG 1st FLOOR**
4. **BG 4th FLOOR**
5. **Maintenance**
6. **Afterhours**
7. **Recoveries**

### Office tab content (CACAK / KRAGUJEVAC / BG 1st / BG 4th)
Two side-by-side editable tables matching the xlsx columns:
- **Empty & Late for delivery** — columns: `Truck#`, `Note`
- **Home** — columns: `Truck`, `Note`

Each table:
- Renders an `<input>` per cell (text), inline-editable.
- Starts with ~10 blank rows; "+ Add row" button at the bottom appends a row.
- Row delete (small trash icon) on hover.
- Uses the project's `table-fixed` + absolute widths convention (per Core memory), small/compact styling consistent with Reports.

### Maintenance tab
Single table — columns: `Truck`, `Note` (wide note column, like the xlsx merged cells). Same add-row / delete-row controls.

### Afterhours tab
Single table — columns: `Truck`, `Note` (wide note column). Same controls.

### Recoveries tab
Single table — columns: `Truck`, `Note`. Same controls.

### State management
- All entries stored in component-local React state (`useState`) keyed by tab. **Not persisted** — refresh wipes everything (per user's "Prepare UI only, no save yet" choice).
- Changing the date does **not** reset state in this phase; we'll wire per-date persistence when DB is approved.

### Design / styling
- Reuse semantic tokens from `index.css` — no hardcoded colors.
- Table headers styled like Reports' section headers (muted background, small uppercase labels).
- Mobile: tables become horizontally scrollable; tabs collapse to a horizontally scrollable strip.

### Out of scope (explicit, per "no DB changes for now")
- No Supabase table, no migration, no realtime, no edge function.
- No autosave, no per-date persistence, no export to xlsx.
- No data pulled from `trucks`/`orders` — operators type everything manually, exactly like the xlsx today.

### Files touched
- **New**: `src/pages/DailyReport.tsx`
- **New**: `src/components/dailyReport/DailyReportTable.tsx` (small reusable editable table component used by all tabs)
- **Edit**: `src/App.tsx` — register `/daily-report` route
- **Edit**: `src/components/Sidebar.tsx` — add nav entry below "Home time"
