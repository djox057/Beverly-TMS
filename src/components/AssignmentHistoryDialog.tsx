import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssignmentHistory } from "@/hooks/useAssignmentHistory";
import { calculateTenures, calculateCombinedDriverTenures, Tenure } from "@/utils/tenureCalculator";
import { TenureList } from "@/components/TenureCard";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";

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

  // Calculate tenures based on entity type
  const { driverTenures, trailerTenures, truckTenures, dispatcherTenures } = useMemo(() => {
    if (!history || history.length === 0) {
      return { driverTenures: [], trailerTenures: [], truckTenures: [], dispatcherTenures: [] };
    }

    // Filter dispatcher history entries for dispatcher tenure calculation
    const dispatcherHistory = history.filter(h => h.change_type === 'dispatcher_assignment');
    
    return {
      driverTenures: calculateCombinedDriverTenures(history.filter(h => h.change_type !== 'dispatcher_assignment')),
      trailerTenures: calculateTenures(history.filter(h => h.change_type !== 'dispatcher_assignment'), 'trailer'),
      truckTenures: calculateTenures(history.filter(h => h.change_type !== 'dispatcher_assignment'), 'truck'),
      dispatcherTenures: calculateTenures(dispatcherHistory, 'dispatcher'),
    };
  }, [history]);

  const renderTenureContent = (tenures: Tenure[], tenureEntityType: 'driver' | 'truck' | 'trailer' | 'dispatcher') => (
    <ScrollArea className="h-[400px] pr-4">
      <TenureList 
        tenures={tenures} 
        entityType={tenureEntityType}
        emptyMessage={`No ${tenureEntityType} history found`}
      />
    </ScrollArea>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    switch (entityType) {
      case 'truck':
        if (!history || history.length === 0) {
          return (
            <div className="text-center py-8 text-muted-foreground">
              No assignment history found
            </div>
          );
        }
        return (
          <Tabs defaultValue="drivers" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="drivers">Driver Tenures</TabsTrigger>
              <TabsTrigger value="trailers">Trailer Tenures</TabsTrigger>
            </TabsList>
            <TabsContent value="drivers" className="mt-4">
              {renderTenureContent(driverTenures, 'driver')}
            </TabsContent>
            <TabsContent value="trailers" className="mt-4">
              {renderTenureContent(trailerTenures, 'trailer')}
            </TabsContent>
          </Tabs>
        );

      case 'driver':
        return (
          <Tabs defaultValue="trucks" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="trucks">Truck Tenures</TabsTrigger>
              <TabsTrigger value="trailers">Trailer Tenures</TabsTrigger>
              <TabsTrigger value="dispatcher">Dispatcher</TabsTrigger>
            </TabsList>
            <TabsContent value="trucks" className="mt-4">
              {renderTenureContent(truckTenures, 'truck')}
            </TabsContent>
            <TabsContent value="trailers" className="mt-4">
              {renderTenureContent(trailerTenures, 'trailer')}
            </TabsContent>
            <TabsContent value="dispatcher" className="mt-4">
              {renderTenureContent(dispatcherTenures, 'dispatcher')}
            </TabsContent>
          </Tabs>
        );

      case 'trailer':
        if (!history || history.length === 0) {
          return (
            <div className="text-center py-8 text-muted-foreground">
              No assignment history found
            </div>
          );
        }
        return (
          <Tabs defaultValue="trucks" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="trucks">Truck Tenures</TabsTrigger>
              <TabsTrigger value="drivers">Driver Tenures</TabsTrigger>
            </TabsList>
            <TabsContent value="trucks" className="mt-4">
              {renderTenureContent(truckTenures, 'truck')}
            </TabsContent>
            <TabsContent value="drivers" className="mt-4">
              {renderTenureContent(driverTenures, 'driver')}
            </TabsContent>
          </Tabs>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assignment History - {entityName}</DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};
