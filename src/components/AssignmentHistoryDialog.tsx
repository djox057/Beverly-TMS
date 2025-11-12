import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssignmentHistory } from "@/hooks/useAssignmentHistory";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface AssignmentHistoryDialogProps {
  entityType: 'truck' | 'trailer' | 'driver';
  entityId: string | null;
  entityName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AssignmentHistoryDialog = ({
  entityType,
  entityId,
  entityName,
  open,
  onOpenChange,
}: AssignmentHistoryDialogProps) => {
  const { data: history, isLoading } = useAssignmentHistory(entityType, entityId);

  const getChangeTypeLabel = (changeType: string) => {
    // Context-aware labels based on which entity page we're viewing from
    // The change_type is recorded from the truck's perspective, so we need to translate it
    
    if (entityType === 'driver') {
      // From driver's perspective: what changed for them?
      const labels: Record<string, string> = {
        'driver_assignment': 'Truck Assignment', // Driver was assigned to/from a truck
        'trailer_assignment': 'Trailer Assignment', // Their truck's trailer changed
        'assignment_change': 'Assignment Change',
        'truck_assignment': 'Truck Assignment',
      };
      return labels[changeType] || changeType.replace('_', ' ');
    } else if (entityType === 'truck') {
      // From truck's perspective: what was assigned to it?
      const labels: Record<string, string> = {
        'driver_assignment': 'Driver Assignment', // Truck got a new driver
        'trailer_assignment': 'Trailer Assignment', // Truck got a new trailer
        'assignment_change': 'Assignment Change',
        'truck_assignment': 'Truck Assignment',
      };
      return labels[changeType] || changeType.replace('_', ' ');
    } else if (entityType === 'trailer') {
      // From trailer's perspective: what changed?
      const labels: Record<string, string> = {
        'driver_assignment': 'Driver Assignment', // Trailer's truck got a new driver
        'trailer_assignment': 'Truck Assignment', // Trailer was assigned to different truck
        'assignment_change': 'Assignment Change',
        'truck_assignment': 'Truck Assignment',
      };
      return labels[changeType] || changeType.replace('_', ' ');
    }
    
    return changeType.replace('_', ' ');
  };

  const formatChangeDescription = (entry: any) => {
    const parts = [];
    
    parts.push(`Truck: ${entry.truck_number || 'None'}`);
    parts.push(`Trailer: ${entry.trailer_number || 'None'}`);
    parts.push(`Driver 1: ${entry.driver1_name || 'None'}`);
    if (entry.driver2_name || entry.driver2_id) {
      parts.push(`Driver 2: ${entry.driver2_name || 'None'}`);
    }

    return parts.join(' • ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Assignment History - {entityName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !history || history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No assignment history found
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-4 bg-card"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1 text-primary">
                        {getChangeTypeLabel(entry.change_type)}
                      </div>
                      <div className="font-medium text-sm mb-2">
                        {formatChangeDescription(entry)}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>
                          Changed: {format(new Date(entry.changed_at), "MMM dd, yyyy 'at' h:mm a")}
                        </div>
                        {entry.changed_by_name && (
                          <div>By: {entry.changed_by_name}</div>
                        )}
                      </div>
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
