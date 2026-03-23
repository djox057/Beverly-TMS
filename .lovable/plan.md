

## Fix: Use UPDATE Instead of DELETE+INSERT for Role Switching

### Problem

The `process-afterhours-schedule` edge function currently **deletes** the user's role row and then **inserts** a new one. This is fragile — if the insert fails after the delete, the user has no role at all (even with the rollback attempt). It also creates a window where the user has no role.

### Fix

Replace the delete+insert pattern with a single `UPDATE` on the `user_roles` table, changing `role` from `dispatch` to `afterhours` (start) or `afterhours` to `dispatch` (end).

**File: `supabase/functions/process-afterhours-schedule/index.ts`**

**Start action (lines 115-141)** — replace delete+insert with:
```typescript
const { error: updateErr } = await supabaseAdmin
  .from('user_roles')
  .update({ role: 'afterhours' })
  .eq('user_id', userId)
  .eq('role', 'dispatch');

if (updateErr) {
  results.push({ userId, action: 'error - update to afterhours failed', error: updateErr.message });
  continue;
}
results.push({ userId, action: 'dispatch -> afterhours' });
```

**End action (lines 155-185)** — same pattern:
```typescript
const { error: updateErr } = await supabaseAdmin
  .from('user_roles')
  .update({ role: 'dispatch' })
  .eq('user_id', userId)
  .eq('role', 'afterhours');

if (updateErr) {
  results.push({ userId, action: 'error - update to dispatch failed', error: updateErr.message });
  continue;
}
results.push({ userId, action: 'afterhours -> dispatch' });
```

No need to check if role exists first — the update is a no-op if no matching row exists, and we can check `count` from the response to log whether it actually changed anything.

### Files Changed
- `supabase/functions/process-afterhours-schedule/index.ts` — replace delete+insert with single update for both start and end actions

