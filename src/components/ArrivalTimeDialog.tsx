import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

interface ArrivalTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (arrivalTime: string) => void;
  title: string;
}

export function ArrivalTimeDialog({
  open,
  onOpenChange,
  onConfirm,
  title
}: ArrivalTimeDialogProps) {
  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");

  // Initialize with current Chicago time when dialog opens
  useEffect(() => {
    if (open) {
      const now = new Date();
      const chicagoTime = toZonedTime(now, "America/Chicago");
      setArrivalDate(format(chicagoTime, "yyyy-MM-dd"));
      setArrivalTime(format(chicagoTime, "HH:mm"));
    }
  }, [open]);

  const handleConfirm = () => {
    if (!arrivalDate || !arrivalTime) return;
    
    // Combine date and time into "YYYY-MM-DD HH:MM:SS" format
    const arrivalDateTime = `${arrivalDate} ${arrivalTime}:00`;
    onConfirm(arrivalDateTime);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="arrival-date">Arrival Date</Label>
            <Input
              id="arrival-date"
              type="date"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="arrival-time">Arrival Time</Label>
            <Input
              id="arrival-time"
              type="time"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!arrivalDate || !arrivalTime}>
            Confirm Arrival
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
