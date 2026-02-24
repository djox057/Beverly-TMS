

# Trim Notes and Deduplicate History in Reports

## What Changes

1. **Trim whitespace** from notes before saving -- users will no longer see trailing/leading spaces in their notes.
2. **Block duplicate history entries** -- if a note edit produces the same trimmed content as the last history entry, no new history row is created. The 7-slot history will only contain meaningful content changes.
3. **Timestamp still updates every time** -- the `truck_notes` row is always upserted (no skipping), so "last edit" time bumps on every save.

## Technical Details

### Change 1: `src/pages/Reports.tsx` -- Trim at both call sites

- **Line 1279**: Change `note: editing.value` to `note: editing.value.trim()`
- **Line 3076**: Change `note: newValue` to `note: newValue.trim()`

### Change 2: `src/hooks/useReports.ts` -- Trim in mutation

- **Line 319** (inside `mutationFn`): Use `note.trim()` instead of raw `note` in the upsert payload
- **Lines 357, 388** (inside `onMutate`): Use trimmed note in the optimistic update so the UI immediately reflects trimmed content

### Change 3: Database trigger -- Gate history writes

The `save_truck_note_history()` trigger fires on every `INSERT OR UPDATE` to `truck_notes`. Currently it always inserts a new history row. The fix adds a check: compare `NEW.note` (trimmed) against the most recent history entry for that driver. If identical, skip the insert.

SQL migration:

```sql
CREATE OR REPLACE FUNCTION public.save_truck_note_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  last_note TEXT;
  trimmed_note TEXT;
BEGIN
  trimmed_note := TRIM(BOTH FROM COALESCE(NEW.note, ''));

  -- Get the most recent history entry for this driver
  SELECT TRIM(BOTH FROM COALESCE(note, ''))
  INTO last_note
  FROM public.truck_note_history
  WHERE driver_id = NEW.driver_id
  ORDER BY edited_at DESC
  LIMIT 1;

  -- Only insert if the trimmed content is different
  IF last_note IS DISTINCT FROM trimmed_note THEN
    INSERT INTO public.truck_note_history (driver_id, note, edited_by)
    VALUES (NEW.driver_id, trimmed_note, NEW.updated_by);

    -- Delete old entries beyond 7
    DELETE FROM public.truck_note_history
    WHERE id IN (
      SELECT id
      FROM public.truck_note_history
      WHERE driver_id = NEW.driver_id
      ORDER BY edited_at DESC
      OFFSET 7
    );
  END IF;

  RETURN NEW;
END;
$function$;
```

## Summary

| Location | What |
|---|---|
| `src/pages/Reports.tsx` (lines 1279, 3076) | `.trim()` on note value before passing to mutation |
| `src/hooks/useReports.ts` (mutationFn + onMutate) | Use trimmed note in upsert payload and optimistic update |
| Database trigger `save_truck_note_history()` | Skip history insert when trimmed content matches last entry |

No extra DB round trips. The upsert always fires (timestamp always bumps). Only the history trigger gains a dedup check.
