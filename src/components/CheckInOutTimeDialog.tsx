import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toZonedTime, format } from "date-fns-tz";

interface CheckInOutTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (checkInTime: string | null, checkOutTime: string | null) => void;
  title: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}

export function CheckInOutTimeDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  checkInTime,
  checkOutTime,
}: CheckInOutTimeDialogProps) {
  const [checkInDate, setCheckInDate] = useState("");
  const [checkInTimeValue, setCheckInTimeValue] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkOutTimeValue, setCheckOutTimeValue] = useState("");

  useEffect(() => {
    if (open) {
      const now = toZonedTime(new Date(), "America/Chicago");
      
      if (checkInTime) {
        const checkInDate = new Date(checkInTime);
        setCheckInDate(format(checkInDate, "yyyy-MM-dd", { timeZone: "America/Chicago" }));
        setCheckInTimeValue(format(checkInDate, "HH:mm", { timeZone: "America/Chicago" }));
      } else {
        setCheckInDate(format(now, "yyyy-MM-dd", { timeZone: "America/Chicago" }));
        setCheckInTimeValue(format(now, "HH:mm", { timeZone: "America/Chicago" }));
      }

      if (checkOutTime) {
        const checkOutDate = new Date(checkOutTime);
        setCheckOutDate(format(checkOutDate, "yyyy-MM-dd", { timeZone: "America/Chicago" }));
        setCheckOutTimeValue(format(checkOutDate, "HH:mm", { timeZone: "America/Chicago" }));
      } else {
        setCheckOutDate("");
        setCheckOutTimeValue("");
      }
    }
  }, [open, checkInTime, checkOutTime]);

  const handleConfirm = () => {
    const checkIn = checkInDate && checkInTimeValue 
      ? `${checkInDate} ${checkInTimeValue}:00`
      : null;
    
    const checkOut = checkOutDate && checkOutTimeValue
      ? `${checkOutDate} ${checkOutTimeValue}:00`
      : null;

    onConfirm(checkIn, checkOut);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="checkin-date">Check In Date</Label>
            <Input
              id="checkin-date"
              type="date"
              value={checkInDate}
              onChange={(e) => setCheckInDate(e.target.value)}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="checkin-time">Check In Time</Label>
            <Input
              id="checkin-time"
              type="time"
              value={checkInTimeValue}
              onChange={(e) => setCheckInTimeValue(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="checkout-date">Check Out Date (Optional)</Label>
            <Input
              id="checkout-date"
              type="date"
              value={checkOutDate}
              onChange={(e) => setCheckOutDate(e.target.value)}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="checkout-time">Check Out Time (Optional)</Label>
            <Input
              id="checkout-time"
              type="time"
              value={checkOutTimeValue}
              onChange={(e) => setCheckOutTimeValue(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
