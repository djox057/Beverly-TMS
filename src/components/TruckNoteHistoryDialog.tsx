import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const { data: history, isLoading } = useTruckNoteHistory(truckId);

  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
      return format(date, 'h:mm a');
    } else if (hours < 48) {
      return 'Yesterday';
    } else {
      return format(date, 'MMM d');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Edit History</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : !history || history.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No edit history
          </div>
        ) : (
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-4 py-4">
              {history.map((entry, index) => {
                const previousEntry = history[index + 1];
                const isFirstEdit = !previousEntry;
                const editDate = new Date(entry.edited_at);
                
                return (
                  <div key={entry.id} className="flex gap-3 animate-fade-in">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(entry.editor_name, entry.editor_email)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-sm">
                          {entry.editor_name || entry.editor_email || 'Unknown'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(editDate)}
                        </span>
                      </div>
                      
                      {isFirstEdit ? (
                        <div className="bg-primary/10 dark:bg-primary/20 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%]">
                          <p className="text-sm break-words">
                            {entry.note || <span className="italic text-muted-foreground">(empty)</span>}
                          </p>
                          <div className="text-xs text-muted-foreground mt-1">
                            Created note
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 max-w-[85%]">
                          <div className="bg-destructive/10 rounded-2xl rounded-tl-sm px-4 py-2.5 line-through opacity-60">
                            <p className="text-sm break-words">
                              {previousEntry.note || <span className="italic text-muted-foreground">(empty)</span>}
                            </p>
                          </div>
                          <div className="bg-primary/10 dark:bg-primary/20 rounded-2xl rounded-tl-sm px-4 py-2.5">
                            <p className="text-sm break-words">
                              {entry.note || <span className="italic text-muted-foreground">(empty)</span>}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
