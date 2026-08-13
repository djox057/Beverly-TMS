# Rename "Alerts" page to "Safety and Maintenance"

Display-name change only. The route stays `/alerts`, and no data, permissions, or alert logic change.

## Changes

- Sidebar (`src/components/Sidebar.tsx`): rename every `Alerts` nav entry label to `Safety and Maintenance` (admin, manager, supervisor, chicago_management, safety, maintenance, and remaining role lists). The existing count badge and icon stay as they are.
- Page heading (`src/pages/Alerts.tsx`): change the `Expiration Alerts` title to `Safety and Maintenance`.

## Notes

- Route, file names, hooks, and role access rules remain unchanged, so existing links and bookmarks keep working.
