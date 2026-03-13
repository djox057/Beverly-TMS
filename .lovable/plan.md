

## Fix Display Issue: Adding Dispatchers Beyond Office Thresholds

### Problem
In the AfterhoursScheduleDialog, when an office already has its threshold met (3 KG, 2 CA, 2 BG) and the user clicks "+" to add more, the add section may be clipped or invisible. This happens because:

1. The existing schedules `ScrollArea` has `max-h-[60vh]`
2. The add section `ScrollArea` has `max-h-48 sm:max-h-[40vh]`
3. Together they can total up to 100vh inside a 90vh dialog, causing the add section to overflow below the visible area
4. The parent container has `overflow-hidden min-h-0` which clips the overflowing content

### Fix in `src/components/AfterhoursScheduleDialog.tsx`

1. **Reduce the existing schedules ScrollArea max-height** when the add section is also visible — change from `max-h-[60vh]` to a smaller value like `max-h-[35vh]` when `needsMoreDispatchers || forceShowOffice` is true, keeping `max-h-[60vh]` when only viewing existing schedules.

2. **Make the right-side column scrollable** — change the right column from `overflow-hidden` to `overflow-y-auto` so both sections can be reached by scrolling.

3. **Adjust the add section ScrollArea** — reduce `max-h-48 sm:max-h-[40vh]` to `max-h-48 sm:max-h-[30vh]` to better share space.

This ensures both the existing schedule list and the "add more" checkboxes are visible and scrollable within the dialog.

