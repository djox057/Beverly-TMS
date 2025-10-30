import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LifeBuoy } from "lucide-react";

interface RecoveryDialogProps {
  driverId: string | null;
  truckNumber: string;
  driverName: string;
  isRecovery: boolean;
  onToggle: (driverId: string, isRecovery: boolean, note: string) => Promise<void>;
}

export const RecoveryDialog = ({
  driverId,
  truckNumber,
  driverName,
  isRecovery,
  onToggle
}: RecoveryDialogProps) => {
  const [open, setOpen] = useState(false);
  const [recoveryNote, setRecoveryNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = () => {
    if (!driverId) return;
    
    if (isRecovery) {
      // If already in recovery, turn it off
      handleToggle(false, "");
    } else {
      // Open dialog to turn on recovery
      setRecoveryNote("");
      setOpen(true);
    }
  };

  const handleToggle = async (recovery: boolean, note: string) => {
    if (!driverId) return;
    
    setIsSubmitting(true);
    try {
      await onToggle(driverId, recovery, note);
      setOpen(false);
      setRecoveryNote("");
      window.location.reload();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!recoveryNote.trim()) return;
    await handleToggle(true, recoveryNote.trim());
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={`h-[18px] w-[18px] p-0 rounded-full z-[50] border ${
          isRecovery 
            ? "bg-black hover:bg-black/80 border-black" 
            : "bg-background hover:bg-muted border-border"
        }`}
        onClick={handleClick}
        disabled={!driverId}
      >
        <LifeBuoy 
          className="h-[14px] w-[14px] text-black"
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
