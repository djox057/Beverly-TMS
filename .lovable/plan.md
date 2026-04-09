

## Fix: Preserve Dispatcher Names After User Deletion

### Problem
When a user (dispatcher) is deleted, the `delete-user` edge function deletes their `profiles` row. The `get_assignment_history` database function resolves dispatcher names by joining `profiles` on `dispatcher_id` / `old_dispatcher_id`. After deletion, these joins return NULL, so the UI shows "Unknown".

### Solution
Before deleting the profile in the `delete-user` edge function, snapshot the dispatcher's name directly into the `assignment_history` rows. Add two new text columns to `assignment_history` to store denormalized names, and backfill them during deletion.

**Step 1 — Migration: Add snapshot columns**

Add two nullable text columns to `assignment_history`:
- `dispatcher_name_snapshot`
- `old_dispatcher_name_snapshot`

**Step 2 — Update `get_assignment_history` function**

Change the dispatcher name resolution to use `COALESCE`:
```sql
COALESCE(disp.full_name, ah.dispatcher_name_snapshot)::text AS dispatcher_name,
COALESCE(old_disp.full_name, ah.old_dispatcher_name_snapshot)::text AS old_dispatcher_name
```

This way, if the profile still exists, use the live name. If deleted, fall back to the snapshot.

**Step 3 — Update `delete-user` edge function**

Before deleting the profile, snapshot the user's name into assignment_history:
```typescript
// Snapshot dispatcher name before profile deletion
const { data: profile } = await supabaseAdmin
  .from('profiles')
  .select('full_name')
  .eq('user_id', userId)
  .single();

if (profile?.full_name) {
  await supabaseAdmin
    .from('assignment_history')
    .update({ dispatcher_name_snapshot: profile.full_name })
    .eq('dispatcher_id', userId);

  await supabaseAdmin
    .from('assignment_history')
    .update({ old_dispatcher_name_snapshot: profile.full_name })
    .eq('old_dispatcher_id', userId);
}
```

Also snapshot `changed_by` name:
- Add `changed_by_name_snapshot` column
- Update the function to `COALESCE(p.full_name, ah.changed_by_name_snapshot)`
- Snapshot before deletion for `changed_by` references too

### Files Changed
1. **New migration** — Add `dispatcher_name_snapshot`, `old_dispatcher_name_snapshot`, `changed_by_name_snapshot` columns to `assignment_history`; update `get_assignment_history` function with COALESCE fallbacks
2. **`supabase/functions/delete-user/index.ts`** — Add snapshot logic before profile deletion

