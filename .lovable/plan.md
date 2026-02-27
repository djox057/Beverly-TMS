

# Restrict Manager & Supervisor from Lock, Invoiced, and Paid Controls

## Summary
Remove interactive control of lock, invoiced, and paid fields from manager and supervisor roles. Values remain visible as read-only text. Enforcement is applied at three layers: UI visibility, handler-level guards, and a database trigger.

## 1. Orders Page (`src/pages/Orders.tsx`)

### Lock/Unlock button (line 1822) and Bulk Lock (line 2032)
- Change condition from `(hasRole("manager") || hasRole("admin") || hasRole("accounting") || hasRole("supervisor"))` to `(hasRole("admin") || hasRole("accounting"))` in both places.

### Invoiced toggle (line 1683-1696)
- For manager/supervisor: render as plain text ("Yes"/"No") without the click handler and `cursor-pointer` styling.
- For other allowed roles: keep the existing clickable span.

### Paid checkbox (line 1841-1851)
- For manager/supervisor: render as plain text ("Yes"/"No") instead of a Checkbox.
- For other allowed roles: keep the existing Checkbox.

### Handler guards (safety net)

**`toggleOrderLock`** (~line 801): Add early return at the top:
```
if (primaryRole === 'manager' || primaryRole === 'supervisor') {
  toast.error("Managers and supervisors cannot change lock status");
  return;
}
```

**`bulkLockOrders`** (~line 695): Same early return guard.

**`handleConfirmInvoicedChange`** (~line 1068): Same pattern with "cannot change invoiced status" message.

**`handleConfirmPaidChange`** (~line 1035): Same pattern with "cannot change paid status" message.

## 2. Trips Page (`src/pages/Trips.tsx`)

### Paid column (line 482)
- Keep `canSeePaidColumn` as-is (visible for manager). Do NOT hide the column.
- Instead, introduce a new variable: `const canTogglePaid = primaryRole !== 'dispatch' && primaryRole !== 'supervisor' && primaryRole !== 'manager';`

### Individual order paid (line 5470-5480)
- When `!canTogglePaid`: render plain text (checkmark or dash) instead of Checkbox.
- When `canTogglePaid`: keep existing Checkbox.

### Week-level paid checkbox (line ~5050-5052)
- Same conditional: plain text for manager/supervisor, Checkbox for admin/accounting.

### Week-level "Mark all paid/unpaid" button (line ~5110)
- Hide for manager/supervisor using `canTogglePaid`.

### Handler guards

**`confirmOrderPaidToggle`** (~line 691): Early return with toast error for manager/supervisor.

**`confirmPaidToggle`** (~line 740): Same guard.

## 3. Database Trigger (new migration)

Create a BEFORE UPDATE trigger on `public.orders` that prevents manager/supervisor roles from modifying `locked`, `invoiced`, `invoiced_at`, and `paid`.

```sql
-- Rollback commands (at top of migration, commented for reference)
-- DROP TRIGGER IF EXISTS enforce_manager_supervisor_field_restrictions ON public.orders;
-- DROP FUNCTION IF EXISTS public.prevent_manager_supervisor_restricted_fields();

CREATE OR REPLACE FUNCTION public.prevent_manager_supervisor_restricted_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_roles app_role[];
BEGIN
  user_roles := public.auth_user_roles();

  IF user_roles && ARRAY['manager'::app_role, 'supervisor'::app_role]
     AND NOT user_roles && ARRAY['admin'::app_role, 'accounting'::app_role]
  THEN
    IF OLD.locked IS DISTINCT FROM NEW.locked THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change lock status';
    END IF;
    IF OLD.invoiced IS DISTINCT FROM NEW.invoiced THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change invoiced status';
    END IF;
    IF OLD.invoiced_at IS DISTINCT FROM NEW.invoiced_at THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change invoiced_at';
    END IF;
    IF OLD.paid IS DISTINCT FROM NEW.paid THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change paid status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_manager_supervisor_field_restrictions
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_manager_supervisor_restricted_fields();
```

### Rollback SQL (included in migration as comments)
```sql
DROP TRIGGER IF EXISTS enforce_manager_supervisor_field_restrictions ON public.orders;
DROP FUNCTION IF EXISTS public.prevent_manager_supervisor_restricted_fields();
```

## 4. No trigger conflicts
Verified: no existing trigger auto-sets `invoiced_at`. The only BEFORE UPDATE trigger on orders is `update_updated_at_column` (sets `updated_at = now()`), which does not touch any of the restricted fields. The `capture_original_delivery_datetime` trigger only touches `original_delivery_datetime`. No chained conflict.

## Files Modified
- `src/pages/Orders.tsx` -- UI read-only + handler guards for lock, invoiced, paid
- `src/pages/Trips.tsx` -- paid column read-only + handler guards
- New database migration -- BEFORE UPDATE trigger with rollback SQL

