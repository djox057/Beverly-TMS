## Goal

Make the "unlocked first, by pickup date ascending" sort on `/orders` actually surface the unlocked rows reported by the filter summary (e.g. "6 unlocked"), instead of starting the table with locked rows.

## Root cause

In `src/utils/ordersTransform.ts` the `locked` field is passed through unchanged from the DB row:

```ts
locked: order.locked,   // line 116 (and 406)
```

Unlike `invoiced`, `paid`, `canceled`, and `isRecovery` right next to it, `locked` is not normalized. When the API returns it as the string `"true"` / `"false"` (legacy / CSV-imported rows), every truthy string is treated as "locked" by the unlocked-first sort in `src/pages/Orders.tsx`:

```ts
const unlocked = rows.filter((o) => !o.locked) ...
```

`!"false"` is `false`, so rows whose `locked` is the string `"false"` are bucketed as locked and never lifted to the top. The summary counts them as unlocked (computed server-side from the real column), which is why the badge says "6 unlocked" while none appear first.

## Change

### `src/utils/ordersTransform.ts`

Normalize `locked` to a real boolean in both transformer return blocks (lines ~116 and ~406), mirroring how `invoiced` / `paid` are handled:

```ts
locked: order.locked === true || order.locked === "true" || order.locked === 1,
```

No other call sites need to change — every consumer already treats `locked` as a boolean, and DB writes (`update({ locked: true/false })`) keep producing real booleans.

## Out of scope

- Backend column type changes / migration to coerce existing string values.
- Any change to the sort helper, filter prefetch, or summary edge function.
- Other transformer fields.

## Verification

1. Apply the pickup-date filter from the screenshot (Jun 01 – Jun 23, 2026). Badge still shows "6 unlocked" and those 6 rows now render at the top, ordered by pickup date ascending, before any locked row.
2. Lock one of the 6 from the row action → it drops below the unlocked group; badge updates to "5 unlocked".
3. Clear filters → unfiltered page still shows unlocked first / locked underneath, unchanged from current behavior for rows whose `locked` was already a real boolean.
4. Switch filter to a different month → no flash of locked-first ordering (existing stale-flash guard still applies).
