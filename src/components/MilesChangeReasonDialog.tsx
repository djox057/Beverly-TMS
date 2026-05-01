import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface MilesChangeInfo {
  dhMilesChanged: boolean;
  loadedMilesChanged: boolean;
  oldDhMiles: number;
  newDhMiles: number;
  oldLoadedMiles: number;
  newLoadedMiles: number;
}

interface MilesChangeReasonDialogProps {
  open: boolean;
  onConfirm: (reason: string) => void;
  changeInfo: MilesChangeInfo;
}

export function MilesChangeReasonDialog({
  open,
  onConfirm,
  changeInfo,
}: MilesChangeReasonDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setReason("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {/* prevent closing */}}>
      <DialogContent
        className="sm:max-w-[450px] [&>button:last-child]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Miles Changed Significantly</DialogTitle>
          <DialogDescription>
            You've changed miles. Please provide a reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-sm">
            {changeInfo.dhMilesChanged && (
              <p>
                <span className="font-medium">DH Miles:</span>{" "}
                {changeInfo.oldDhMiles} → {changeInfo.newDhMiles}{" "}
                <span className="text-muted-foreground">
                  (Δ {Math.abs(changeInfo.newDhMiles - changeInfo.oldDhMiles)})
                </span>
              </p>
            )}
            {changeInfo.loadedMilesChanged && (
              <p>
                <span className="font-medium">Loaded Miles:</span>{" "}
                {changeInfo.oldLoadedMiles} → {changeInfo.newLoadedMiles}{" "}
                <span className="text-muted-foreground">
                  (Δ {Math.abs(changeInfo.newLoadedMiles - changeInfo.oldLoadedMiles)})
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="miles-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="miles-reason"
              placeholder="Why are you changing the miles?..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleConfirm} disabled={!reason.trim()}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Threshold for significant miles change */
export const MILES_CHANGE_THRESHOLD = 35;

/** Check if miles changed significantly */
export function checkMilesChange(
  oldDh: number,
  newDh: number,
  oldLoaded: number,
  newLoaded: number,
): { significant: boolean; dhMilesChanged: boolean; loadedMilesChanged: boolean } {
  const dhDiff = Math.abs(newDh - oldDh);
  const loadedDiff = Math.abs(newLoaded - oldLoaded);
  const dhMilesChanged = dhDiff > MILES_CHANGE_THRESHOLD;
  const loadedMilesChanged = loadedDiff > MILES_CHANGE_THRESHOLD;
  return {
    significant: dhMilesChanged || loadedMilesChanged,
    dhMilesChanged,
    loadedMilesChanged,
  };
}

/** Get SMS recipient phone numbers */
export function getMilesChangeSmsRecipients(office: string | null | undefined): string[] {
  if (!office) return [];

  // Ben and Krki always receive for all offices
  const recipients = ["+16304733879", "+12192938764"];

  // Office-specific recipients
  const upper = office.toUpperCase();
  if (upper === "BG 1ST FLOOR" || upper === "BG 2ND FLOOR") {
    recipients.push("+12192938762"); // Lucas
  } else if (upper === "KRAGUJEVAC") {
    recipients.push("+15743476856"); // Guss
  }

  return recipients;
}

/** Build SMS message for miles change */
export function buildMilesChangeSmsMessage(params: {
  internalLoadNumber: string;
  brokerLoadNumber: string;
  dhMilesChanged: boolean;
  loadedMilesChanged: boolean;
  oldDh: number;
  newDh: number;
  oldLoaded: number;
  newLoaded: number;
  reason: string;
  userName: string;
}): string {
  const lines: string[] = [];
  lines.push(`Miles changed for Internal Load #${params.internalLoadNumber}, Broker load #${params.brokerLoadNumber}`);
  if (params.dhMilesChanged) {
    lines.push(`DH Miles Changed from ${params.oldDh} to ${params.newDh}`);
  }
  if (params.loadedMilesChanged) {
    lines.push(`Loaded Miles Changed from ${params.oldLoaded} to ${params.newLoaded}`);
  }
  lines.push(`Reason:\n${params.reason}`);
  lines.push(params.userName);
  return lines.join("\n");
}
