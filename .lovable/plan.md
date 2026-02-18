

## Fix: Office-Specific SMS Recipients for Miles Changes

### Problem
The `getMilesChangeSmsRecipients` function currently sends SMS only to Ben (+16304733879) and Krki (+12192938764) for all offices. It needs to also include office-specific recipients:
- **BEOGRAD** office: also send to Lucas (+12192938762)
- **KRAGUJEVAC** office: also send to Guss (+15743476856)

### Change
**File: `src/components/MilesChangeReasonDialog.tsx`** (lines 132-136)

Update `getMilesChangeSmsRecipients` to include office-specific numbers alongside Ben and Krki:

```typescript
/** Get SMS recipient phone numbers */
export function getMilesChangeSmsRecipients(office: string | null | undefined): string[] {
  if (!office) return [];

  // Ben and Krki always receive for all offices
  const recipients = ["+16304733879", "+12192938764"];

  // Office-specific recipients
  const upper = office.toUpperCase();
  if (upper === "BEOGRAD") {
    recipients.push("+12192938762"); // Lucas
  } else if (upper === "KRAGUJEVAC") {
    recipients.push("+15743476856"); // Guss
  }

  return recipients;
}
```

This is a one-function, 4-line change. Ben and Krki continue receiving for every office; Lucas and Guss are added for their respective offices only.
