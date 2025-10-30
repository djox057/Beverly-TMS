import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LifeBuoy } from "lucide-react";

interface RecoveryDialogProps {
  truckId: string;
  truckNumber: string;
  driverName: string;
  isRecovery: boolean;
  currentNote: string;
  onConfirm: (truckId: string, note: string) => Promise<void>;
  onCancel: (truckId: string) => Promise<void>;
}

export const RecoveryDialog = ({
  truckId,
  truckNumber,
  driverName,
  isRecovery,
  currentNote,
  onConfirm,
  onCancel
}: RecoveryDialogProps) => {
  const [open, setOpen] = useState(false);
  const [recoveryNote, setRecoveryNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = () => {
    if (isRecovery) {
      // If already in recovery, cancel it directly
      handleCancel();
    } else {
      // Open dialog to add recovery
      setRecoveryNote("");
      setOpen(true);
    }
  };

  const handleConfirm = async () => {
    if (!recoveryNote.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onConfirm(truckId, recoveryNote.trim());
      setOpen(false);
      setRecoveryNote("");
      window.location.reload(); // Refresh the page
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setIsSubmitting(true);
    try {
      await onCancel(truckId);
      setOpen(false);
      window.location.reload(); // Refresh the page
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={`h-[23px] w-[23px] p-0.5 rounded-full z-[50] border ${
          isRecovery 
            ? "bg-black hover:bg-black/80 border-black" 
            : "bg-background hover:bg-muted border-border"
        }`}
        onClick={handleClick}
      >
        <LifeBuoy 
          className="h-[19px] w-[19px] text-black"
        />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Recovery - {driverName} (Truck {truckNumber})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Recovery Note</label>
              <Textarea
                value={recoveryNote}
                onChange={(e) => setRecoveryNote(e.target.value)}
                placeholder="Enter recovery details..."
                className="min-h-[100px]"
                autoFocus
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!recoveryNote.trim() || isSubmitting}
              >
                {isSubmitting ? "Setting..." : "Set Recovery"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
