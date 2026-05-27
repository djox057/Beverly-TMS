## Daily Report polish

UI-only refinements to `/daily-report`. No data/logic changes.

### 1. Tabs span full width and are larger
In `src/pages/DailyReport.tsx`:
- Change `TabsList` to `grid w-full grid-cols-4 sm:grid-cols-7 h-auto` so the 7 tabs split the full row width on desktop and wrap to a 4-col grid on phones (no horizontal scroll).
- Bump trigger size: `text-sm sm:text-base font-semibold py-2.5` and `w-full` so each tab fills its grid cell.
- Allow wrapping inside a trigger for long labels (`whitespace-normal leading-tight`) so "BG 1st FLOOR" doesn't clip on mobile.

### 2. Date picker — narrower + prev/next arrow buttons
Replace the single wide `Popover` button with a compact 3-part control:
```
[‹]  [📅 05/19/2026]  [›]
```
- Two `Button variant="outline" size="icon"` (ChevronLeft / ChevronRight) that call `setDate(addDays(date, -1))` / `setDate(addDays(date, 1))` (`date-fns`).
- Middle button keeps the popover + calendar, but width shrinks to fit content (`w-[150px]`, remove the `w-[220px]`).
- Wrap the three in a `flex items-center gap-1` group.

### 3. Fix input focus overflow inside table cells
In `src/components/dailyReport/DailyReportTable.tsx`:
- The shared `Input` applies `focus-visible:ring-2 ... ring-offset-2`, which paints a 2px ring + 2px offset that escapes the cell border (visible in screenshot 2).
- Pass `focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-accent/30` on the cell `<Input>` and rely on a subtle background tint to indicate focus.
- Also add `overflow-hidden` to each cell wrapper `<div>` as a belt-and-suspenders guard so any residual outline is clipped to the cell.

### Files touched
- `src/pages/DailyReport.tsx` — tabs layout + date picker with arrows.
- `src/components/dailyReport/DailyReportTable.tsx` — input focus styling + cell overflow clipping.

### Out of scope
No persistence, no data wiring, no column changes.
