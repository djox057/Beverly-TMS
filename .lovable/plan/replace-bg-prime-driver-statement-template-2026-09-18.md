# Replace BG Prime driver statement template

## Goal
Use the uploaded `BG_new_template.xlsx` for BG Prime driver statements exported from Trips, while preserving the current statement calculations and data.

## Changes
- Add the new workbook as the BG Prime statement template used by the app.
- Remap driver/company details, issue date, pay period, truck/agreement details, trips, deductions, fuel, credits, totals, and net pay to the new worksheet positions.
- Preserve the template's formatting, merged cells, formulas, images, and print layout.
- Keep existing LALE, Jones, company-driver, and other company statement exports unchanged.
- Verify the generated workbook recalculates with no formula errors and that the app still builds successfully.

## Technical details
- The uploaded template uses trip rows 13–20, deductions 25–33, fuel 39–54, credits 58–59, and net pay at I68:J69.
- The BG Prime exporter will use these ranges and the template's existing formulas rather than positions from the prior workbook.
