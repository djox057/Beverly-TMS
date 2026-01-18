import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Loader2 } from "lucide-react";
import { useDriverProblems } from "@/hooks/useDriverProblems";

interface DriverProblemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  truckNumber: string;
}

export function DriverProblemDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
  truckNumber,
}: DriverProblemDialogProps) {
  const [reason, setReason] = useState("");
  const { addProblem, getProblemForDriver, resolveProblem } = useDriverProblems();
  
  const existingProblem = getProblemForDriver(driverId);
  const isSubmitting = addProblem.isPending;
  const isResolving = resolveProblem.isPending;

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    
    await addProblem.mutateAsync({ driverId, reason: reason.trim() });
    setReason("");
    onOpenChange(false);
  };

  const handleResolve = async () => {
    if (!existingProblem) return;
    await resolveProblem.mutateAsync(existingProblem.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            {existingProblem ? "Driver Problem" : "Report Problem"}
          </DialogTitle>
          <DialogDescription>
            {existingProblem 
              ? `View or resolve problem for ${driverName}`
              : `Report a problem for ${driverName} (Truck #${truckNumber})`
            }
          </DialogDescription>
        </DialogHeader>

        {existingProblem ? (
          <div className="space-y-4">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-destructive mb-2">Current Problem:</p>
              <p className="text-sm whitespace-pre-wrap">{existingProblem.reason}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Reported: {new Date(existingProblem.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button 
                variant="default"
                onClick={handleResolve}
                disabled={isResolving}
              >
                {isResolving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  "Mark Resolved"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Textarea
                placeholder="Describe the problem..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={!reason.trim() || isSubmitting}
                variant="destructive"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Problem"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
