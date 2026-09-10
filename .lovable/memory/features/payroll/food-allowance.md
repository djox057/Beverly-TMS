---
name: Food allowance removed
description: Food allowance removed from ALL offices for dispatcher salaries as of Sep 2026 — do not re-add
type: constraint
---
Food allowance ($70, previously Čačak/Kragujevac only) was removed for ALL offices for dispatcher salaries (user request, Sep 10 2026).

**Why:** User explicitly removed it.
**How to apply:** `hasFoodOffice` in `src/pages/Analytics.tsx` and `src/components/DispatcherSalaryChart.tsx` always returns false; `getFoodAllowance` therefore returns 0. The PDF/doc generators (`payrollPdfGenerator.ts`, `payrollDocGenerator.ts`) only render the Food allowance row when amount > 0, so statements omit it automatically. Do not re-add office-based food allowance unless the user asks.
