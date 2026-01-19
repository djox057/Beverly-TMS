import { useState } from "react";
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

interface AssignmentReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeType: "truck" | "trailer" | "both";
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function AssignmentReasonDialog({
  open,
  onOpenChange,
  changeType,
  onConfirm,
  onCancel,
}: AssignmentReasonDialogProps) {
  const [reason, setReason] = useState("");

  const getTitle = () => {
    switch (changeType) {
      case "truck":
        return "Reason for Truck Change";
      case "trailer":
        return "Reason for Trailer Change";
      case "both":
        return "Reason for Truck & Trailer Change";
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
    }
  };

  const handleConfirm = () => {
    onConfirm(reason.trim());
    setReason("");
  };

  const handleCancel = () => {
    setReason("");
    onCancel();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{getTitle()}</AlertDialogTitle>
          <AlertDialogDescription>{getDescription()}</AlertDialogDescription>
        </AlertDialogHeader>
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
          <AlertDialogAction onClick={handleConfirm} disabled={!reason.trim()}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
