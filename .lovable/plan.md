# Translate Icon for Driver Complaints

Add the same translate-to-English toggle used on Yard Arrivals to the Drivers Complaints page.

## What changes

- Each complaint card body (the complaint text) gets a small translate (language) icon in the corner. Clicking it swaps the text to an English translation; clicking again returns the original.
- Each complaint comment gets the same small translate icon, toggling that comment between original and English.
- Loading state shows a spinner on the icon while the translation is fetched; failures leave the original text visible.
- Translations are fetched on demand and cached in component state for the session (no database column added, so nothing new is persisted).

## Technical notes

- Reuse the existing `translate-yard-note` edge function via `supabase.functions.invoke`, sending only `{ text }` (no `id`), exactly as `TranslatableOrderNote` already does — no backend or migration work needed.
- Introduce a small shared inline component (a thin wrapper around the existing pattern) used in:
  - `src/components/complaints/ComplaintCard.tsx` — wraps the `{c.content}` paragraph.
  - `src/components/complaints/ComplaintComments.tsx` — wraps each comment's `{c.content}` block.
- Icon: `Languages` from lucide-react, ghost icon button `h-5 w-5` / `h-6 w-6`, positioned absolute top-right of the text block, matching Yard Arrivals styling.
- No permission changes: the toggle is display-only and available to all roles that can already view complaints, including view-only (chicago_management, yard, Joey).
