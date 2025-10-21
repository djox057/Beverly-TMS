import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useTruckNoteHistory } from "@/hooks/useTruckNoteHistory";
import { format } from "date-fns";

interface TruckNoteHistoryDialogProps {
  truckId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TruckNoteHistoryDialog = ({
  truckId,
  open,
  onOpenChange,
}: TruckNoteHistoryDialogProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { data: history, isLoading } = useTruckNoteHistory(truckId);

  const currentEntry = history?.[currentIndex];
  const previousEntry = history?.[currentIndex + 1];

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (history && currentIndex < history.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      onOpenChange(newOpen);
      if (!newOpen) setCurrentIndex(0);
    }}>
      <DialogContent className="sm:max-w-[500px] z-[103]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Edit history</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                disabled={!history || currentIndex === history.length - 1}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading history...
          </div>
        ) : !history || history.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No edit history available
          </div>
        ) : (
          <div className="space-y-4">
            {currentEntry && (
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {getInitials(currentEntry.editor_name, currentEntry.editor_email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="font-semibold">
                    {currentEntry.editor_name || currentEntry.editor_email || 'Unknown User'}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(new Date(currentEntry.edited_at), 'MMMM d, h:mm a')}
                  </div>
                </div>
              </div>
            )}

            {previousEntry && currentEntry && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Replaced:</span>{' '}
                  <span className="italic">"{previousEntry.note || '(empty)'}"</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">with:</span>{' '}
                  <span className="italic">"{currentEntry.note || '(empty)'}"</span>
                </div>
              </div>
            )}

            {currentEntry && !previousEntry && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="text-sm">
                  <span className="font-medium">Initial note:</span>{' '}
                  <span className="italic">"{currentEntry.note || '(empty)'}"</span>
                </div>
              </div>
            )}

            <div className="text-xs text-center text-muted-foreground">
              {currentIndex + 1} of {history.length}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
