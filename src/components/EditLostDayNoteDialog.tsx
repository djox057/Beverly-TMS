import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";

interface EditLostDayNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckNumber: string;
  date: string;
  currentNote: string;
  currentComment: string;
  isSaving: boolean;
  onSave: (note: string, isHomeTime: boolean, comment?: string | null) => void;
}

export function EditLostDayNoteDialog({
  open,
  onOpenChange,
  truckNumber,
  date,
  currentNote,
  currentComment,
  isSaving,
  onSave,
}: EditLostDayNoteDialogProps) {
  const [note, setNote] = useState(currentNote);
  const [comment, setComment] = useState(currentComment);
  const [isHomeTime, setIsHomeTime] = useState(false);

  useEffect(() => {
    if (open) {
      setNote(currentNote);
      setComment(currentComment);
      setIsHomeTime(currentNote === "Home Time");
    }
  }, [open, currentNote, currentComment]);

  const handleSave = () => {
    const updatedComment = comment.trim() || null;
    onSave(note, isHomeTime, comment === currentComment ? undefined : updatedComment);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lost Day Note</DialogTitle>
          <DialogDescription className="sr-only">Edit the note and comment for this truck and date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Truck: <span className="font-semibold text-foreground">{truckNumber}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Date: <span className="font-semibold text-foreground">{date ? format(new Date(date), "EEEE, MMMM d, yyyy") : ""}</span>
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="red-cell-note">Note</Label>
            <Textarea
              id="red-cell-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter note"
              className="min-h-[80px]"
              disabled={isHomeTime || isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="red-cell-comment">Comment</Label>
            <Textarea
              id="red-cell-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="home-time-toggle"
              checked={isHomeTime}
              onCheckedChange={setIsHomeTime}
              disabled={isSaving}
            />
            <Label htmlFor="home-time-toggle" className="cursor-pointer">
              Mark as Home Time
            </Label>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
