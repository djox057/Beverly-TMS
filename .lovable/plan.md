Plan: Change a user's email, and keep the old address working for login

## Goal
1. Let admins change a user's email address (e.g. `tony@bfprime.net` → `tony@beverlyfreight.net`) from the Admin Users page.
2. Let that user still sign in with the **old** address (`tony@bfprime.net`) using the same password.

## Current state
- The Admin Users edit dialog can change role, full name, office, ext, phone, gross/cut %, daily report permissions, and suggestions — but not email.
- The `update-user-role` edge function has a service-role admin client available but does not touch auth email.
- `public.profiles.email` is a plain text column, kept in sync manually.
- `Login.tsx` passes the typed email straight to `signIn(email, password)`.
- Supabase Auth allows exactly **one** email per auth user, so "two working logins" must be implemented as an alias that is resolved to the real address before sign-in.
- User `tony@bfprime.net` exists (`Lazar Petrovic-Tony`).

## What will be built

### 1. Email alias table (new)
Create `public.user_email_aliases`:
- `user_id` — the auth user the alias points at
- `alias_email` — the old address, unique, stored lowercase
- `primary_email` — the current real auth email
- standard id / created_at / created_by

Access rules:
- Only admins can view, add, or remove aliases.
- Login resolution does not read the table directly; it goes through a security-definer function so anonymous visitors never get table access.

### 2. Login alias resolution function
A security-definer database function `resolve_login_email(p_email text)`:
- Returns the primary email when the input matches an alias.
- Returns the input unchanged otherwise.
- Executable by anonymous and authenticated users, returns nothing but an email string, so it does not leak account existence beyond what login already reveals.

### 3. Backend: extend `update-user-role` edge function
- Accept an optional `email` field.
- Validate format and reject an email already used by another auth user.
- When the email changes:
  - Update the auth user via the admin API (email confirmed, no confirmation mail).
  - Update `profiles.email`.
  - Insert an alias row mapping the **old** email to the new one, and re-point any existing aliases for that user to the new primary email.

### 4. Frontend: Admin Users edit dialog
- Add an editable Email field, pre-filled with the current email, with inline validation.
- Send it in the update payload.
- Show the user's existing login aliases beneath the field, each with a remove button, so an admin can revoke an old address later.

### 5. Frontend: Login and password reset
- Before calling sign-in, resolve the typed address through `resolve_login_email` and sign in with the returned address. The user's typed old address keeps working transparently.
- Apply the same resolution to the Forgot Password flow so a reset requested with the old address reaches the real account.

## Out of scope
- Users changing their own email.
- Multiple simultaneous "real" mailboxes on one account (Supabase supports one).
- Bulk email changes.

## Risks and notes
- Changing the auth email invalidates password-reset links issued to the old address; existing sessions may need re-login.
- The alias only makes **login** work with the old address. Notification emails the app sends will go to the new address.
- Old addresses stay valid for login until an admin removes the alias.

## Verification
- Change `tony@bfprime.net` to `tony@beverlyfreight.net`.
- Sign in with the new address and existing password — succeeds.
- Sign in with `tony@bfprime.net` and the same password — also succeeds.
- Confirm `profiles.email` and the auth user both show the new address, and one alias row exists.
- Remove the alias and confirm the old address no longer signs in.
