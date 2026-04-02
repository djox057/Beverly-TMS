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
  hasRecoveryStatus: boolean; // truck.needs_recovery is true
  hasRecoveryDriverAssigned: boolean; // truck already has recovery driver assigned
  onConfirm: (startDate: Date, type: GameOverType, note: string, recoveryDriverId?: string) => void;
  onInitialConfirm?: (startDate: Date, type: GameOverType, note: string) => Promise<void>;
  onAssignRecoveryDriver: (recoveryDriverId: string) => void;
  onRemoveAll: () => void;
}

export function SetDriverStatusDialog({
  open,
  onOpenChange,
  truckNumber,
  truckId,
  existingDates,
  hasRecoveryStatus,
  hasRecoveryDriverAssigned,
  onConfirm,
  onInitialConfirm,
  onAssignRecoveryDriver,
  onRemoveAll,
}: SetDriverStatusDialogProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [type, setType] = useState<GameOverType>("yard");
  const [note, setNote] = useState("");
  const [recoveryDriverId, setRecoveryDriverId] = useState<string>("");
  const [step, setStep] = useState<"initial" | "awaiting_recovery" | "has_recovery">("initial");
  const [isProcessing, setIsProcessing] = useState(false);

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
      setIsProcessing(false);
      
      // Determine initial step based on truck state
      if (hasRecoveryStatus) {
        if (hasRecoveryDriverAssigned) {
          setStep("has_recovery");
        } else {
          setStep("awaiting_recovery");
        }
      } else {
        setStep("initial");
      }
    }
  }, [open, hasRecoveryStatus, hasRecoveryDriverAssigned]);

  const handleInitialConfirm = async () => {
    if (!startDate || !note.trim()) return;
    
    // If recovery driver is selected, do full confirm
    if (recoveryDriverId) {
      onConfirm(startDate, type, note, recoveryDriverId);
      onOpenChange(false);
      return;
    }
    
    // No recovery driver - do initial actions then show step 2
    if (onInitialConfirm) {
      setIsProcessing(true);
      try {
        await onInitialConfirm(startDate, type, note);
        setStep("awaiting_recovery");
      } catch (error) {
        // Error handling is done in parent
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Fallback to old behavior if onInitialConfirm not provided
      onConfirm(startDate, type, note, undefined);
      onOpenChange(false);
    }
  };

  const handleAddRecoveryDriver = () => {
    if (recoveryDriverId) {
      // If we came from initial step with date/note, use full confirm
      if (startDate) {
        onConfirm(startDate, type, note, recoveryDriverId);
      } else {
        // If we're just assigning recovery driver to existing status
        onAssignRecoveryDriver(recoveryDriverId);
      }
      onOpenChange(false);
    }
  };

  const handleDone = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "has_recovery" 
              ? `Remove Status - ${truckNumber}`
              : step === "awaiting_recovery" 
                ? `Assign Recovery Driver - ${truckNumber}` 
                : `Set Driver Status - ${truckNumber}`}
          </DialogTitle>
        </DialogHeader>
        
        {step === "has_recovery" ? (
          // Truck already has recovery status AND recovery driver assigned - just show remove option
          <div className="space-y-4">
            <div className="p-3 bg-muted border border-border rounded-md">
              <p className="text-sm">
                This truck already has a recovery driver assigned. 
                You can remove the status to reset it.
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => onOpenChange(false)} 
                variant="outline" 
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  onRemoveAll();
                  onOpenChange(false);
                }} 
                variant="destructive" 
                className="flex-1"
              >
                Remove Status
              </Button>
            </div>
          </div>
        ) : step === "initial" ? (
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
                  modal={false}
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
                onClick={handleInitialConfirm} 
                disabled={!startDate || !note.trim() || isProcessing} 
                className="flex-1"
              >
                {isProcessing ? "Processing..." : "Set Status"}
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
        ) : (
          // Step: Awaiting recovery driver assignment (either from initial flow or reopening)
          <div className="space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <p className="text-sm">
                Truck <span className="font-medium">{truckNumber}</span> {hasRecoveryStatus ? "is marked for recovery" : "has been marked for recovery"}. 
                {hasRecoveryStatus ? " Assign a recovery driver or remove the status." : " Would you like to assign a recovery driver now?"}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Recovery Driver</label>
              <Combobox
                value={recoveryDriverId}
                onValueChange={setRecoveryDriverId}
                options={recoveryDrivers.map(d => ({ value: d.id, label: d.name }))}
                placeholder="Select recovery driver..."
                emptyText="No recovery drivers found"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleAddRecoveryDriver} 
                disabled={!recoveryDriverId} 
                className="flex-1"
              >
                Add Recovery Driver
              </Button>
              {hasRecoveryStatus ? (
                <Button 
                  onClick={() => {
                    onRemoveAll();
                    onOpenChange(false);
                  }} 
                  variant="destructive" 
                  className="flex-1"
                >
                  Remove Status
                </Button>
              ) : (
                <Button 
                  onClick={handleDone} 
                  variant="outline" 
                  className="flex-1"
                >
                  Done
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
