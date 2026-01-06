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
import { useState } from "react";

interface ChangeNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: string[];
  onConfirm: (note: string) => void;
  isSubmitting?: boolean;
}

export function ChangeNoteDialog({
  open,
  onOpenChange,
  changes,
  onConfirm,
  isSubmitting,
}: ChangeNoteDialogProps) {
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    onConfirm(note);
    setNote("");
  };

  const handleCancel = () => {
    setNote("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Explain Your Changes</DialogTitle>
          <DialogDescription>
            You've made the following changes to this order. Please explain why.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* List of detected changes */}
          <div className="rounded-md border bg-muted/50 p-3 max-h-[150px] overflow-y-auto">
            <ul className="space-y-1 text-sm">
              {changes.slice(1).map((change, index) => (
                <li key={index} className="text-muted-foreground">
                  {change}
                </li>
              ))}
            </ul>
          </div>

          {/* Required note input */}
          <div className="space-y-2">
            <Label htmlFor="change-note" className="text-sm font-medium">
              Reason for changes <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="change-note"
              placeholder="Enter the reason for these changes..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!note.trim() || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
