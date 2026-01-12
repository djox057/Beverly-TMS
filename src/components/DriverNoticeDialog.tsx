import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface DriverNoticeDialogProps {
  driverName: string;
  initialNotice: string;
  onSave: (driverName: string, notice: string) => void;
  getTierColor?: (tier: string) => string;
}

export const DriverNoticeDialog = React.memo(({ 
  driverName, 
  initialNotice, 
  onSave 
}: DriverNoticeDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localNotice, setLocalNotice] = useState(initialNotice);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChanges = useRef(false);

  // Sync with external changes when dialog is closed
  useEffect(() => {
    if (!isOpen) {
      setLocalNotice(initialNotice);
    }
  }, [initialNotice, isOpen]);

  const handleChange = (value: string) => {
    setLocalNotice(value);
    hasUnsavedChanges.current = true;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Save after 2 seconds of inactivity
    timeoutRef.current = setTimeout(() => {
      onSave(driverName, value);
      hasUnsavedChanges.current = false;
    }, 2000);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && hasUnsavedChanges.current) {
      // Save immediately when closing
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      onSave(driverName, localNotice);
      hasUnsavedChanges.current = false;
    }
    setIsOpen(open);
  };

  const displayNotice = isOpen ? localNotice : initialNotice;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-2 text-left justify-start"
        >
          <span className="line-clamp-2 text-xs">
            {displayNotice
              ? displayNotice.length > 44
                ? displayNotice.substring(0, 44) + "..."
                : displayNotice
              : "Click to add note..."}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Notice for {driverName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={localNotice}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Enter notice for this driver..."
            className="min-h-[200px]"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
});

DriverNoticeDialog.displayName = "DriverNoticeDialog";
