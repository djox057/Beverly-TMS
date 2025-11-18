import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2 } from "lucide-react";
import { useDispatcherNotes } from "@/hooks/useDispatcherNotes";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface DispatcherNoteDialogProps {
  dispatcherId: string;
  date: string;
  existingNote?: {
    id: string;
    note: string;
    color: 'red' | 'yellow' | 'green';
  };
  canEdit: boolean;
}

const colorOptions = [
  { value: 'green' as const, label: 'Good', bgClass: 'bg-success/20', hoverClass: 'hover:bg-success/30', borderClass: 'border-success' },
  { value: 'yellow' as const, label: 'Normal', bgClass: 'bg-warning/20', hoverClass: 'hover:bg-warning/30', borderClass: 'border-warning' },
  { value: 'red' as const, label: 'Bad', bgClass: 'bg-destructive/20', hoverClass: 'hover:bg-destructive/30', borderClass: 'border-destructive' },
];

export const DispatcherNoteDialog = ({ dispatcherId, date, existingNote, canEdit }: DispatcherNoteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(existingNote?.note || '');
  const [color, setColor] = useState<'red' | 'yellow' | 'green'>(existingNote?.color || 'yellow');
  const { upsertNote, deleteNote } = useDispatcherNotes();
  
  const isToday = format(new Date(), 'yyyy-MM-dd') === date;
  const canModify = canEdit && isToday;

  const handleSave = async () => {
    if (!note.trim()) return;
    
    await upsertNote.mutateAsync({
      dispatcher_id: dispatcherId,
      date,
      note: note.trim(),
      color,
    });
    setOpen(false);
  };

  const handleDelete = async () => {
    if (existingNote?.id) {
      await deleteNote.mutateAsync(existingNote.id);
      setNote('');
      setOpen(false);
    }
  };

  const getColorClasses = (colorValue: 'red' | 'yellow' | 'green') => {
    switch (colorValue) {
      case 'green':
        return 'bg-success/10 text-success border-success/30';
      case 'yellow':
        return 'bg-warning/10 text-warning border-warning/30';
      case 'red':
        return 'bg-destructive/10 text-destructive border-destructive/30';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existingNote ? (
          <button
            className={cn(
              "ml-2 p-1 rounded border transition-colors",
              getColorClasses(existingNote.color),
              canModify && "cursor-pointer hover:opacity-80"
            )}
            title={`${existingNote.note}${canModify ? ' (Click to edit)' : ''}`}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        ) : canEdit && isToday ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-7 px-2"
            title="Add note for today"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        ) : null}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Dispatcher Note - {format(new Date(date), 'MMM d, yyyy')}
            {!isToday && ' (View Only)'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          {canModify && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <div className="flex gap-2">
                {colorOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setColor(option.value)}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-md border-2 transition-all",
                      option.bgClass,
                      color === option.value ? option.borderClass : "border-transparent",
                      option.hoverClass
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Note</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={canModify ? "Enter dispatcher note..." : "No note available"}
              className="min-h-[100px]"
              disabled={!canModify}
            />
          </div>

          {canModify && (
            <div className="flex justify-between gap-2 pt-2">
              {existingNote && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteNote.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!note.trim() || upsertNote.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
