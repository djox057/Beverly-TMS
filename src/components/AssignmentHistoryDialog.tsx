import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssignmentHistory, AssignmentHistoryEntry } from "@/hooks/useAssignmentHistory";
import { format } from "date-fns";
import { Loader2, ArrowRight } from "lucide-react";

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

  const getChangeTypeLabel = (changeType: string, tabType?: 'trailer' | 'driver' | 'truck' | 'all') => {
    // When in a specific tab, show simple labels for combined changes
    if (tabType === 'trailer' && changeType === 'assignment_change') {
      return 'Trailer Change';
    }
    if (tabType === 'driver' && changeType === 'assignment_change') {
      return 'Driver Change';
    }
    if (tabType === 'truck' && changeType === 'assignment_change') {
      return 'Truck Change';
    }

    if (entityType === 'driver') {
      const labels: Record<string, string> = {
        'driver_assignment': 'Truck Change',
        'trailer_assignment': 'Trailer Change',
        'assignment_change': 'Truck & Trailer Change',
        'truck_assignment': 'Truck Change',
        'trailer_update': 'Trailer Change',
        'driver_update': 'Truck Change',
        'truck_update': 'Truck Change',
      };
      return labels[changeType] || changeType.replace(/_/g, ' ');
    } else if (entityType === 'truck') {
      const labels: Record<string, string> = {
        'driver_assignment': 'Driver Change',
        'trailer_assignment': 'Trailer Change',
        'assignment_change': 'Driver & Trailer Change',
        'truck_assignment': 'Truck Change',
        'trailer_update': 'Trailer Change',
        'driver_update': 'Driver Change',
        'truck_update': 'Truck Update',
      };
      return labels[changeType] || changeType.replace(/_/g, ' ');
    } else if (entityType === 'trailer') {
      const labels: Record<string, string> = {
        'driver_assignment': 'Driver Change',
        'trailer_assignment': 'Truck Change',
        'assignment_change': 'Truck & Driver Change',
        'truck_assignment': 'Truck Change',
        'trailer_update': 'Truck Change',
        'driver_update': 'Driver Change',
        'truck_update': 'Truck Change',
      };
      return labels[changeType] || changeType.replace(/_/g, ' ');
    }
    
    return changeType.replace(/_/g, ' ');
  };

  /**
   * HARDENED: Format change description using explicit before/after values
   * This is deterministic and doesn't rely on array position comparisons
   */
  const formatChangeDescription = (entry: AssignmentHistoryEntry, showType: 'trailer' | 'driver' | 'truck' | 'all') => {
    const changes: React.ReactNode[] = [];
    
    if (showType === 'trailer' || showType === 'all') {
      const oldTrailer = entry.old_trailer_number;
      const newTrailer = entry.trailer_number;
      
      if (oldTrailer !== newTrailer || oldTrailer || newTrailer) {
        changes.push(
          <div key="trailer" className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">Trailer:</span>
            <span className="text-muted-foreground">{oldTrailer || 'None'}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold">{newTrailer || 'None'}</span>
          </div>
        );
      }
    }
    
    if (showType === 'truck' || showType === 'all') {
      const oldTruck = entry.old_truck_number;
      const newTruck = entry.truck_number;
      
      if (oldTruck !== newTruck || oldTruck || newTruck) {
        changes.push(
          <div key="truck" className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">Truck:</span>
            <span className="text-muted-foreground">{oldTruck || 'None'}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold">{newTruck || 'None'}</span>
          </div>
        );
      }
    }
    
    if (showType === 'driver' || showType === 'all') {
      // Build driver text with both drivers
      const buildDriverText = (d1: string | null, d2: string | null) => {
        if (!d1 && !d2) return 'None';
        if (d1 && d2) return `${d1} / ${d2}`;
        return d1 || d2 || 'None';
      };
      
      const oldDriver = buildDriverText(entry.old_driver1_name, entry.old_driver2_name);
      const newDriver = buildDriverText(entry.driver1_name, entry.driver2_name);
      
      if (oldDriver !== newDriver) {
        changes.push(
          <div key="driver" className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">Driver:</span>
            <span className="text-muted-foreground">{oldDriver}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold">{newDriver}</span>
          </div>
        );
      }
    }
    
    // Fallback for entries without old_ values (legacy data)
    if (changes.length === 0) {
      const parts = [];
      if (showType === 'trailer' || showType === 'all') {
        parts.push(`Trailer: ${entry.trailer_number || 'None'}`);
      }
      if (showType === 'truck' || showType === 'all') {
        parts.push(`Truck: ${entry.truck_number || 'None'}`);
      }
      if (showType === 'driver' || showType === 'all') {
        parts.push(`Driver: ${entry.driver1_name || 'None'}${entry.driver2_name ? ` / ${entry.driver2_name}` : ''}`);
      }
      return <div className="text-sm">{parts.join(' • ')}</div>;
    }

    return <div className="space-y-1">{changes}</div>;
  };

  const isTrailerChange = (changeType: string) => {
    return changeType === 'trailer_assignment' || changeType === 'trailer_update';
  };

  const isDriverChange = (changeType: string) => {
    return changeType === 'driver_assignment' || changeType === 'driver_update';
  };

  const isTruckChange = (changeType: string) => {
    return changeType === 'truck_assignment' || changeType === 'truck_update' || changeType === 'driver_assignment';
  };

  const trailerHistory = history?.filter(entry => 
    isTrailerChange(entry.change_type) || entry.change_type === 'assignment_change'
  ) || [];

  const driverHistory = history?.filter(entry => 
    isDriverChange(entry.change_type) || entry.change_type === 'assignment_change'
  ) || [];

  const truckHistory = history?.filter(entry => 
    isTruckChange(entry.change_type) || entry.change_type === 'assignment_change'
  ) || [];

  const renderHistoryList = (items: typeof history, showType: 'trailer' | 'driver' | 'truck' | 'all') => {
    if (!items || items.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No history found
        </div>
      );
    }

    return (
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-4">
          {items.map((entry) => (
            <div
              key={entry.id}
              className="border rounded-lg p-4 bg-card"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-1 text-primary">
                    {getChangeTypeLabel(entry.change_type, showType)}
                  </div>
                  <div className="text-sm mb-2">
                    {formatChangeDescription(entry, showType)}
                  </div>
                  {entry.reason && (
                    <div className="text-sm text-muted-foreground mb-2 italic">
                      Reason: {entry.reason}
                    </div>
                  )}
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
    );
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
        ) : entityType === 'truck' ? (
          <Tabs defaultValue="trailer" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="trailer">Trailer Changes</TabsTrigger>
              <TabsTrigger value="driver">Driver Changes</TabsTrigger>
            </TabsList>
            <TabsContent value="trailer" className="mt-4">
              {renderHistoryList(trailerHistory, 'trailer')}
            </TabsContent>
            <TabsContent value="driver" className="mt-4">
              {renderHistoryList(driverHistory, 'driver')}
            </TabsContent>
          </Tabs>
        ) : entityType === 'trailer' ? (
          <Tabs defaultValue="truck" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="truck">Truck Changes</TabsTrigger>
              <TabsTrigger value="driver">Driver Changes</TabsTrigger>
            </TabsList>
            <TabsContent value="truck" className="mt-4">
              {renderHistoryList(truckHistory, 'truck')}
            </TabsContent>
            <TabsContent value="driver" className="mt-4">
              {renderHistoryList(driverHistory, 'driver')}
            </TabsContent>
          </Tabs>
        ) : entityType === 'driver' ? (
          <Tabs defaultValue="truck" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="truck">Truck Changes</TabsTrigger>
              <TabsTrigger value="trailer">Trailer Changes</TabsTrigger>
            </TabsList>
            <TabsContent value="truck" className="mt-4">
              {renderHistoryList(truckHistory, 'truck')}
            </TabsContent>
            <TabsContent value="trailer" className="mt-4">
              {renderHistoryList(trailerHistory, 'trailer')}
            </TabsContent>
          </Tabs>
        ) : !history || history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No assignment history found
          </div>
        ) : (
          renderHistoryList(history, 'all')
        )}
      </DialogContent>
    </Dialog>
  );
};
