# Reports: no office selected while Individual Mode (coverage) is on

## Problem
When Individual Mode auto-enables for afterhours/weekend coverage, the Reports page keeps highlighting an office tab (e.g. ČAČAK) even though the data shown is the user's own covered trucks. There is no MY TRUCKS tab and none should appear — the office tab row should show no selection at all while coverage is on.

## Desired behavior
- Individual Mode on + coverage list exists → no office tab is highlighted (no MY TRUCKS tab in the UI).
- Clicking an office tab while coverage is on exits Individual Mode and loads that office (existing `setActiveTab` behavior, kept).
- Turning Individual Mode off via the sidebar "Individual" switch returns to the user's own office tab.
- Office tabs behave exactly as today when Individual Mode is off.

## Changes — all in `src/pages/Reports.tsx`

1. **Coverage sentinel for the active tab**
   - Add `const COVERAGE_TAB = "__coverage__"` (a value that never matches a real office).
   - Add an effect: when `(hasCoverageScope && individualMode)` becomes true, set `activeTab` to `COVERAGE_TAB`; when it turns false and `activeTab` is still `COVERAGE_TAB`, restore `getInitialTab()`.
   - Guard against fighting the click-to-exit flow: when the user clicks a real office, `setActiveTab` sets the tab first and then turns Individual Mode off — the restore effect must only fire when the tab is still the sentinel.

2. **Office filtering must not filter during coverage**
   - `filterReportsByOffice` (~line 3668) and `companiesInOffice` (~line 732) filter by `expandOffice(activeTab)`. With the sentinel, that matches nothing and would blank the coverage view.
   - When coverage is on (`hasCoverageScope && individualMode`), skip the office constraint in both places (the data itself is already scoped to the covered driver list by the reports hook).

3. **Already correct, no change needed**
   - `priorityOffice` is already `null` when coverage + Individual Mode are on (`useReportsDateWindowAdapter`), so the data fetch is right.
   - `TabsList` renders no matching trigger for the sentinel, so no tab highlights; `TabsContent value={activeTab}` still renders the coverage data.

## Verification
- Typecheck/build passes.
- Playwright on the preview (if a session can be minted) or code-level check: with an afterhours user in Individual Mode, no tab is highlighted; the covered-trucks list renders; clicking an office exits Individual Mode and loads that office.
