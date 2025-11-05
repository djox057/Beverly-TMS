import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { Combobox } from "@/components/ui/combobox";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type GameOverType = "yard" | "at_road";

interface SetDriverStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckNumber: string;
  truckId: string;
  existingDates: string[];
  onConfirm: (startDate: Date, type: GameOverType, note: string, recoveryDriverId?: string) => void;
  onRemoveAll: () => void;
}

export function SetDriverStatusDialog({
  open,
  onOpenChange,
  truckNumber,
  truckId,
  existingDates,
  onConfirm,
  onRemoveAll,
}: SetDriverStatusDialogProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [type, setType] = useState<GameOverType>("yard");
  const [note, setNote] = useState("");
  const [recoveryDriverId, setRecoveryDriverId] = useState<string>("");

  // Fetch recovery drivers
  const { data: recoveryDrivers = [] } = useQuery({
    queryKey: ["recovery-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, name")
        .eq("is_recovery", true)
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setStartDate(undefined);
      setType("yard");
      setNote("");
      setRecoveryDriverId("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (startDate && note.trim()) {
      onConfirm(startDate, type, note, recoveryDriverId || undefined);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Driver Status - {truckNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {existingDates && existingDates.length > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm font-medium mb-2">Current Status Dates:</p>
              <div className="text-xs space-y-1">
                {existingDates.map(date => (
                  <div key={date}>{format(new Date(date), "MMM dd, yyyy")}</div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Status Type</label>
              <ToggleGroup 
                type="single" 
                value={type} 
                onValueChange={(value: GameOverType) => value && setType(value)} 
                className="justify-start"
              >
                <ToggleGroupItem value="yard" className="flex-1">
                  Left truck on the Yard
                </ToggleGroupItem>
                <ToggleGroupItem value="at_road" className="flex-1">
                  Recovery On the road
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div>
              <label className="text-sm font-medium">Date</label>
              <DatePicker 
                date={startDate} 
                onDateChange={setStartDate} 
                placeholder="Select date" 
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Recovery Driver (Optional)</label>
              <Combobox
                value={recoveryDriverId}
                onValueChange={setRecoveryDriverId}
                options={recoveryDrivers.map(d => ({ value: d.id, label: d.name }))}
                placeholder="Select recovery driver..."
                emptyText="No recovery drivers found"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank to assign later in Recovery tab
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Note</label>
              <Textarea 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter note for this status..."
                className="min-h-[100px]"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleConfirm} 
              disabled={!startDate || !note.trim()} 
              className="flex-1"
            >
              Set Status
            </Button>
            {existingDates && existingDates.length > 0 && (
              <Button 
                onClick={() => {
                  onRemoveAll();
                  onOpenChange(false);
                }} 
                variant="destructive" 
                className="flex-1"
              >
                Remove All
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
