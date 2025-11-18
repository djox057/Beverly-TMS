import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { useDispatcherNotes } from "@/hooks/useDispatcherNotes";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DispatcherNoteDialogProps {
  dispatcherId: string;
  initialDate?: string;
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

export const DispatcherNoteDialog = ({ dispatcherId, initialDate, existingNote, canEdit }: DispatcherNoteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate ? new Date(initialDate) : new Date());
  const [note, setNote] = useState('');
  const [color, setColor] = useState<'red' | 'yellow' | 'green'>('yellow');
  
  const startDate = format(new Date(selectedDate.getFullYear(), 0, 1), 'yyyy-MM-dd');
  const endDate = format(new Date(selectedDate.getFullYear(), 11, 31), 'yyyy-MM-dd');
  const { notes: dispatcherNotes, upsertNote, deleteNote } = useDispatcherNotes(startDate, endDate);
  
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isToday = selectedDateStr === todayStr;
  const canModify = canEdit && isToday;
  
  // Find note for selected date
  const noteForSelectedDate = dispatcherNotes.find(
    n => n.dispatcher_id === dispatcherId && n.date === selectedDateStr
  );
  
  // Create a map of dates with notes for this dispatcher
  const datesWithNotes = dispatcherNotes
    .filter(n => n.dispatcher_id === dispatcherId)
    .reduce((acc, n) => {
      acc[n.date] = n.color;
      return acc;
    }, {} as Record<string, 'red' | 'yellow' | 'green'>);
  
  // Update note and color when selected date changes
  useEffect(() => {
    if (noteForSelectedDate) {
      setNote(noteForSelectedDate.note);
      setColor(noteForSelectedDate.color);
    } else {
      setNote('');
      setColor('yellow');
    }
  }, [noteForSelectedDate]);

  const handleSave = async () => {
    if (!note.trim()) return;
    
    await upsertNote.mutateAsync({
      dispatcher_id: dispatcherId,
      date: selectedDateStr,
      note: note.trim(),
      color,
    });
    setOpen(false);
  };

  const handleDelete = async () => {
    if (noteForSelectedDate?.id) {
      await deleteNote.mutateAsync(noteForSelectedDate.id);
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
              "cursor-pointer hover:opacity-80"
            )}
            title={`${existingNote.note} (Click to view/edit)`}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-7 px-2"
            title="Add/view notes"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Dispatcher Note - {format(selectedDate, 'MMM d, yyyy')}
            {!isToday && ' (View Only)'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          {/* Date Picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <style>{`
                  .has-green-note {
                    background-color: hsl(var(--success)) !important;
                    color: hsl(var(--success-foreground)) !important;
                    font-weight: 600;
                  }
                  .has-green-note:hover {
                    background-color: hsl(var(--success)) !important;
                    opacity: 0.9;
                  }
                  .has-yellow-note {
                    background-color: hsl(var(--warning)) !important;
                    color: hsl(var(--warning-foreground)) !important;
                    font-weight: 600;
                  }
                  .has-yellow-note:hover {
                    background-color: hsl(var(--warning)) !important;
                    opacity: 0.9;
                  }
                  .has-red-note {
                    background-color: hsl(var(--destructive)) !important;
                    color: hsl(var(--destructive-foreground)) !important;
                    font-weight: 600;
                  }
                  .has-red-note:hover {
                    background-color: hsl(var(--destructive)) !important;
                    opacity: 0.9;
                  }
                `}</style>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                  className="pointer-events-auto"
                  modifiers={{
                    hasGreenNote: (date) => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      return datesWithNotes[dateStr] === 'green';
                    },
                    hasYellowNote: (date) => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      return datesWithNotes[dateStr] === 'yellow';
                    },
                    hasRedNote: (date) => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      return datesWithNotes[dateStr] === 'red';
                    },
                  }}
                  modifiersClassNames={{
                    hasGreenNote: 'has-green-note',
                    hasYellowNote: 'has-yellow-note',
                    hasRedNote: 'has-red-note',
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
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

          <div className="flex justify-between gap-2 pt-2">
            {canModify && noteForSelectedDate && (
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
                {canModify ? 'Cancel' : 'Close'}
              </Button>
              {canModify && (
                <Button
                  onClick={handleSave}
                  disabled={!note.trim() || upsertNote.isPending}
                >
                  Save
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
