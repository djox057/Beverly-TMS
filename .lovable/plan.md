## Root cause

`useDailyReportPermissions` calls `hasRole("admin")` to auto-grant full access. But `hasRole` in `src/hooks/useAuth.ts` returns `true` for `admin` whenever the user has `manager`, `supervisor`, `accounting`, or `chicago_management` — that's the generic "manager-has-same-access-as-admin" override (lines 262–271). So every manager/supervisor was being treated as admin and getting full Daily Report access regardless of the `daily_report_permissions` row.

Verified in DB: user "Test" (acccoc225@gmail.com) has role `manager` and `can_view=false, can_edit=false`, yet the hook was returning `canView=true, canEdit=true`.

## Fix

Change `useDailyReportPermissions` to check the exact role array (not `hasRole`), so only users with the literal `admin` role bypass the permissions table.

### Steps

1. **`src/hooks/useDailyReportPermissions.ts`**
   - Pull `roles` from `useAuthContext()` instead of `hasRole`.
   - Replace `if (hasRole("admin"))` with `if (roles.includes("admin"))`.
   - Update the effect dependency list accordingly.

No DB or other component changes needed — `Sidebar`, `Reports`, `DailyReport`, and `AdminUsers` already consume the hook (or, in AdminUsers' case, check `roles.includes('admin')` directly, which is already correct).

## Result

Managers / supervisors / accounting / chicago_management users will only see the Daily Report sidebar link, Add‑Row button, and page contents when an admin has explicitly toggled `can_view` / `can_edit` for them in User Management. Admins retain automatic full access.