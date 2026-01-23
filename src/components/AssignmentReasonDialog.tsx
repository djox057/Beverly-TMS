import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export interface AssignmentConflict {
  type: "driver" | "trailer";
  name: string; // Driver name or trailer number
  currentTruck: string; // Truck number it's currently assigned to
}

interface AssignmentReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeType: "truck" | "trailer" | "both" | "driver";
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  conflicts?: AssignmentConflict[];
}

export function AssignmentReasonDialog({
  open,
  onOpenChange,
  changeType,
  onConfirm,
  onCancel,
  conflicts = [],
}: AssignmentReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setReason("");
      setConflictAcknowledged(false);
    }
  }, [open]);

  const getTitle = () => {
    switch (changeType) {
      case "truck":
        return "Reason for Truck Change";
      case "trailer":
        return "Reason for Trailer Change";
      case "both":
        return "Reason for Truck & Trailer Change";
      case "driver":
        return "Reason for Driver Change";
    }
  };

  const getDescription = () => {
    switch (changeType) {
      case "truck":
        return "Please provide a reason for changing the truck assignment.";
      case "trailer":
        return "Please provide a reason for changing the trailer assignment.";
      case "both":
        return "Please provide a reason for changing the truck and trailer assignment.";
      case "driver":
        return "Please provide a reason for changing the driver assignment.";
    }
  };

  const handleConfirm = () => {
    onConfirm(reason.trim());
    setReason("");
    setConflictAcknowledged(false);
  };

  const handleCancel = () => {
    setReason("");
    setConflictAcknowledged(false);
    onCancel();
  };

  const hasConflicts = conflicts.length > 0;
  const canConfirm = reason.trim() && (!hasConflicts || conflictAcknowledged);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{getTitle()}</AlertDialogTitle>
          <AlertDialogDescription>{getDescription()}</AlertDialogDescription>
        </AlertDialogHeader>
        
        {/* Conflict warnings */}
        {hasConflicts && (
          <div className="space-y-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
            <p className="text-sm font-semibold text-destructive">Warning: Assignment Conflicts</p>
            {conflicts.map((conflict, idx) => (
              <p key={idx} className="text-sm text-destructive">
                {conflict.type === "driver" ? "Driver" : "Trailer"}{" "}
                <span className="font-semibold">{conflict.name}</span> is currently assigned to truck{" "}
                <span className="font-semibold">{conflict.currentTruck}</span>
              </p>
            ))}
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="conflict-acknowledge"
                checked={conflictAcknowledged}
                onCheckedChange={(checked) => setConflictAcknowledged(checked === true)}
              />
              <label
                htmlFor="conflict-acknowledge"
                className="text-sm font-medium text-destructive cursor-pointer"
              >
                I understand this will reassign from the other truck
              </label>
            </div>
          </div>
        )}

        <div className="py-4">
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter the reason for this assignment change..."
            className="mt-2"
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={!canConfirm}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
