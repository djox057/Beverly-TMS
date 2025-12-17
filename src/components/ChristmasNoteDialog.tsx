import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useChristmasNotes } from "@/hooks/useChristmasNotes";
import { useToast } from "@/hooks/use-toast";

interface ChristmasNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  truckId: string | null;
  truckNumber: string;
}

export const ChristmasNoteDialog = ({
  open,
  onOpenChange,
  driverId,
  driverName,
  truckId,
  truckNumber,
}: ChristmasNoteDialogProps) => {
  const { christmasNotes, upsertNote } = useChristmasNotes();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load existing note when dialog opens
  useEffect(() => {
    if (open && driverId) {
      const existingNote = christmasNotes.find(n => n.driver_id === driverId);
      setNote(existingNote?.note || "");
    }
  }, [open, driverId, christmasNotes]);

  const handleSubmit = async () => {
    if (!note.trim()) {
      toast({
        title: "Note required",
        description: "Please enter a note to save",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await upsertNote.mutateAsync({
        driverId,
        truckId,
        note: note.trim(),
      });
      toast({
        title: "Note saved",
        description: `Christmas note saved for ${driverName}`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving note:", error);
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">❄️</span>
            Christmas Note
            <span className="text-2xl">❄️</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong>Driver:</strong> {driverName}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Truck:</strong> {truckNumber}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="christmas-note">Note</Label>
            <Textarea
              id="christmas-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter your Christmas note..."
              className="min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
