import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  onSave: (note: string, isHomeTime: boolean) => void;
}

export function EditLostDayNoteDialog({
  open,
  onOpenChange,
  truckNumber,
  date,
  currentNote,
  onSave,
}: EditLostDayNoteDialogProps) {
  const [note, setNote] = useState(currentNote);
  const [isHomeTime, setIsHomeTime] = useState(false);

  useEffect(() => {
    if (open) {
      setNote(currentNote);
      setIsHomeTime(currentNote === "Home Time");
    }
  }, [open, currentNote]);

  const handleSave = () => {
    onSave(note, isHomeTime);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Lost Day Note</DialogTitle>
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
              disabled={isHomeTime}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="home-time-toggle"
              checked={isHomeTime}
              onCheckedChange={setIsHomeTime}
            />
            <Label htmlFor="home-time-toggle" className="cursor-pointer">
              Mark as Home Time
            </Label>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
