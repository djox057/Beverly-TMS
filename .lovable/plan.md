

## Problem

The recovery driver Combobox dropdown inside the `SetDriverStatusDialog` doesn't work because of a known Radix UI issue: when a `Popover` (used by Combobox) is rendered inside a modal `Dialog`, the Popover's portaled dropdown content becomes non-interactive. The Dialog's modal behavior sets `inert` on elements outside its overlay, blocking clicks on the Combobox dropdown.

## Fix

**File: `src/components/SetDriverStatusDialog.tsx`**

Add `modal={false}` to the Combobox's parent Popover. Since the Combobox is a shared component, the cleanest approach is to add an optional `modal` prop to the Combobox component that gets forwarded to the internal Popover.

**File: `src/components/ui/combobox.tsx`**

1. Add a `modal?: boolean` prop to the Combobox interface
2. Forward it to `<Popover modal={modal}>` (defaults to `undefined`, so existing usage is unaffected)

**File: `src/components/SetDriverStatusDialog.tsx`**

3. Pass `modal={false}` to both Combobox instances (initial step and awaiting_recovery step) — this tells the Popover not to use modal behavior, allowing clicks inside the Dialog

### Technical Detail

The Combobox change is a single-prop addition:
```tsx
// combobox.tsx
interface ComboboxProps {
  // ... existing props
  modal?: boolean;
}

// In render:
<Popover open={open} onOpenChange={setOpen} modal={modal}>
```

Then in `SetDriverStatusDialog.tsx`, both Combobox usages get `modal={false}`.

