
Problem list

1. The wrong overlay component was changed
- The alert text shown in Reports is coming from `TooltipContent` in `src/pages/Reports.tsx`.
- The previous z-index change was made in `src/components/ui/hover-card.tsx`.
- Result: that change does not affect these Reports alert tooltips at all.

2. The Reports alert text is rendered with Tooltip, not HoverCard
- Single truck/driver alerts use:
  - `Tooltip` + `TooltipContent` around lines ~4033-4061
  - `Tooltip` + `TooltipContent` around lines ~4296-4302
- So the issue is specifically in `src/components/ui/tooltip.tsx`.

3. The tooltip z-index is still too low relative to surrounding layout
- `TooltipContent` currently uses `z-50`.
- The Reports page has sticky content with `z-[101]`.
- The desktop sidebar is fixed with `z-10`, but because the tooltip is not portaled and stays inside the page stacking context, the visible result can still appear underneath surrounding UI.

4. The tooltip is not portaled
- `src/components/ui/popover.tsx` uses `PopoverPrimitive.Portal`.
- `src/components/ui/tooltip.tsx` does not use `TooltipPrimitive.Portal`.
- That means the tooltip can be trapped inside the Reports container instead of floating above the app chrome.

What the solution should be

1. Fix the correct component
- Update `src/components/ui/tooltip.tsx`, not `hover-card.tsx`.

2. Render tooltips through a portal
- Wrap `TooltipPrimitive.Content` in `TooltipPrimitive.Portal`.
- This makes the alert text render at the document overlay layer instead of inside the Reports table/sticky container.

3. Raise tooltip z-index to match other floating UI
- Change `TooltipContent` from `z-50` to a higher value already used by your shared floating components, such as `z-[400]`.
- This keeps behavior consistent with `Popover`, `HoverCard`, and `Select`.

Implementation plan

1. Edit `src/components/ui/tooltip.tsx`
- Add `TooltipPrimitive.Portal`
- Keep existing animation and styling
- Increase z-index from `z-50` to `z-[400]`

2. Leave Reports page logic unchanged
- No changes needed in `src/pages/Reports.tsx`
- The existing tooltips there should automatically start layering correctly after the shared tooltip fix

3. Verify the affected cases in Reports
- Truck single alert tooltip
- Driver single alert tooltip
- Ensure the tooltip text now appears above the left navigation/sidebar and sticky header

Technical details

```text
Current issue:
Reports alert icon -> TooltipContent (z-50, no portal)
                    -> rendered inside page stacking context
                    -> can appear under nav/sticky UI

Planned fix:
Reports alert icon -> TooltipPrimitive.Portal
                    -> TooltipContent z-[400]
                    -> rendered above app chrome
```

Files to change
- `src/components/ui/tooltip.tsx`

Expected outcome
- Alert text/popups in Reports will display on top of the navigation menu instead of being hidden behind it.
