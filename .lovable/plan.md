## Goal
Under the "Reason:" block on each yard arrival card, add a Comments area where a yard arrival can have multiple comments. Only managers and admins can add (and delete their own) comments; everyone who can see the page can read them.

## Database
New table `public.driver_yard_action_comments`:
- `yard_action_id` (references `driver_yard_actions`, cascade delete)
- `content` (text)
- `author_id`, `author_name` (snapshot, so name survives user deletion)
- standard `id`, `created_at`, `updated_at` + update trigger

Access rules:
- Any signed-in user can read comments.
- Only managers and admins can add comments; an author can edit/delete their own; admins can delete any.
- Explicit grants for the Data API roles (authenticated + service_role), per project rule.

## UI (src/pages/YardArrivals.tsx)
- New component `YardActionComments` (own file, `src/components/yard/YardActionComments.tsx`) rendered directly below the Reason block in all four sections that render arrival cards (Yard Arrivals, Returning Truck, and the other two card lists).
- Collapsed by default: a small "Comments (N)" toggle button; expanding shows the list — each entry with author name, timestamp (Chicago time, 12h audit format), text, and a trash icon for the author/admin.
- For managers/admins only: a compact textarea + "Add comment" button below the list. Non-privileged users see the list only, no input.
- Comment counts fetched in one batched query keyed by the visible action IDs, cached with React Query and invalidated on add/delete.

## Technical notes
- Roles read via `useAuthContext().hasRole('manager' | 'admin')`; server-side RLS enforces the same rule, not just the UI.
- Comment text trimmed and length-capped (1000 chars) before insert.
- Follows existing card styling; no changes to arrival creation/edit logic.
