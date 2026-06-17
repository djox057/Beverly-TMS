## Turnover List — Expandable rows

### UI changes (src/pages/TurnoverList.tsx only)

1. **Filter row**: Add a new button on the right side of the same flex row that contains the DateRangePicker and Office filter buttons.
   - Label toggles between `Collapse` (default) and `Expand` based on state.
   - Positioned with `ml-auto` so it sits centered-right in the row.
   - Uses existing shadcn `Button` (outline variant, sm size) with a `ChevronDown`/`ChevronUp` icon.

2. **New state**: `const [expanded, setExpanded] = useState(false)` — controls global expand mode for all dispatcher rows.

3. **Table row rendering**:
   - **Collapsed mode (current behavior)**: One row per dispatcher with the truncated explanation cell that opens the existing detail dialog on click. No change.
   - **Expanded mode (new)**: For each dispatcher, render one parent row (dispatcher name, office, turnover count, blank/summary explanation cell) followed by one child row per terminated driver. Each child row shows in the "Explanation" column:
     - Driver name
     - Termination date (formatted same as the existing dialog)
     - The notes / reason text (same fields the dialog already pulls from `TerminatedDriver`)
     - Last truck assignment if already cached for that dispatcher; otherwise lazy-fetch when the dispatcher is expanded (reuse the same query the dialog uses).
   - Child rows are visually indented and use a muted background so the grouping under each dispatcher is clear.

4. **Data**: No schema changes. `turnoverData` already groups drivers under each dispatcher via `DispatcherTurnover.drivers`, so the expanded view just iterates that array inline.

5. **Click behavior**: In expanded mode the dispatcher row no longer needs to open the modal (data is already inline). The modal stays available in collapsed mode.

### Out of scope
- No backend changes, no new hooks, no styling system changes.
- No change to filters, date range, or office logic.