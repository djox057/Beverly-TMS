import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTruckNoteHistory } from "@/hooks/useTruckNoteHistory";
import { format } from "date-fns";

interface TruckNoteHistoryDialogProps {
  driverId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TruckNoteHistoryDialog = ({
  driverId,
  open,
  onOpenChange,
}: TruckNoteHistoryDialogProps) => {
  const { data: history, isLoading } = useTruckNoteHistory(driverId);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Note History</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading history...
          </div>
        ) : !history || history.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No note history available
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {history.map((entry, index) => (
                <div key={entry.id} className="flex gap-3 animate-fade-in">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="text-xs">
                      {getInitials(entry.editor_name, entry.editor_email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm">
                        {entry.editor_name || entry.editor_email || 'Unknown User'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.edited_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-muted px-3 py-2 text-sm">
                      {entry.note || <span className="italic text-muted-foreground">(empty)</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
