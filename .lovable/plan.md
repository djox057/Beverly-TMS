

## Fix: Add Drivers dialog scrolling

### Root cause

The `ScrollArea` component (Radix `@radix-ui/react-scroll-area`) wraps content in a `Viewport` div that needs very specific height constraints to work. The `DialogContent` uses `display: grid` (from the base dialog styles), which conflicts with `flex flex-col` being added on top. The Radix ScrollArea Viewport has `h-full w-full` but the parent chain doesn't establish a concrete height for it to resolve against, so scrolling never activates.

### Solution

Replace `ScrollArea` with a plain `div` using `overflow-y-auto` and a fixed max-height. This is the native scrollbar approach, which is simpler and more reliable.

### Changes

**File: `src/components/AssignAfterhoursDriversDialog.tsx`**

1. Remove the `ScrollArea` import
2. Replace `<ScrollArea className="flex-1 min-h-0 max-h-[60vh] border rounded-md">` with `<div className="flex-1 min-h-0 max-h-[60vh] overflow-y-auto border rounded-md">`
3. Replace closing `</ScrollArea>` with `</div>`

This mirrors the pattern used successfully in other dialogs (e.g., `EditDriverDialog`, `AddTransferDialog`) that use `overflow-y-auto` directly on the `DialogContent` or inner containers.

