Plan: Allow admins to change a user's email address from Admin Users

## Goal
Enable admins to change a user's email address (e.g. `tony@bfprime.net` → `tony@beverlyfreight.net`) directly from the Admin Users page. Both Supabase Auth and the `public.profiles` table must stay in sync.

## Current state
- The `AdminUsers` page lets admins edit role, full name, office, ext, phone, gross/cut %, daily report permissions, and suggestions, but **not email**.
- The `update-user-role` edge function uses `supabaseAdmin.auth.admin` only to read/list users; it does not update auth email.
- `profiles.email` is a plain text column without unique constraint, but it is used across the app for display and reference.
- User `tony@bfprime.net` exists (full_name: `Lazar Petrovic-Tony`, id `a7ec016d-1a3c-4d90-be65-ce509c385957`).

## What will be changed

### 1. Backend: extend `supabase/functions/update-user-role/index.ts`
- Accept an optional `email` field in the request body.
- Validate the email format with a simple regex.
- Check that the new email is not already assigned to another user in `auth.users` (or `profiles`).
- If `email` is provided and changed:
  - Call `supabaseAdmin.auth.admin.updateUserById(targetUserId, { email: newEmail })`.
  - Update `profiles.email` to the same value.
- Keep existing role/profile updates working as before.

### 2. Frontend: extend `src/pages/AdminUsers.tsx`
- Add an editable email field in the Edit User dialog.
- Pre-populate it with the current email.
- Include it in the payload to the `update-user-role` function.
- Show inline validation error if the email is empty or invalid.
- Disable the Save button while the update is in flight.

### 3. Validation & edge cases
- Email must be a valid email format.
- Email must not already belong to another user.
- If the email is unchanged, skip auth/profile updates.
- If the auth update succeeds but the profile update fails, return a warning so the UI can alert the admin.

## Out of scope
- Allowing users to change their own email (this is admin-only).
- Sending email confirmation to the old/new address (Supabase will handle its own email-change confirmation if configured).
- Bulk email updates.

## Risks
- Changing the email logs the user out of existing sessions and invalidates password-reset links tied to the old address.
- If the user is currently signed in, they will need to sign in again with the new email.

## Verification steps
- Update `tony@bfprime.net` to `tony@beverlyfreight.net` in staging.
- Confirm the `profiles.email` value matches.
- Confirm the auth user row in Supabase shows the new email.
- Confirm the user can sign in with the new email and existing password.
