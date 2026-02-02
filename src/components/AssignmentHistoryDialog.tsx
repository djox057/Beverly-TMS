import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssignmentHistory } from "@/hooks/useAssignmentHistory";
import { calculateTenures, calculateCombinedDriverTenures, Tenure } from "@/utils/tenureCalculator";
import { TenureList, TenureCard } from "@/components/TenureCard";
import { Loader2, UserCog } from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AssignmentHistoryDialogProps {
  entityType: 'truck' | 'trailer' | 'driver';
  entityId: string | null;
  entityName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Fetch current dispatcher for a driver
const useDriverDispatcher = (driverId: string | null, entityType: string) => {
  return useQuery({
    queryKey: ['driver-dispatcher', driverId],
    queryFn: async () => {
      if (!driverId) return null;
      
      const { data: driver, error } = await supabase
        .from('drivers')
        .select('dispatcher_id, created_at')
        .eq('id', driverId)
        .single();
      
      if (error || !driver?.dispatcher_id) return null;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, user_id')
        .eq('user_id', driver.dispatcher_id)
        .single();
      
      return {
        dispatcherId: driver.dispatcher_id,
        dispatcherName: profile?.full_name || 'Unknown Dispatcher',
        driverCreatedAt: driver.created_at,
      };
    },
    enabled: !!driverId && entityType === 'driver',
  });
};

export const AssignmentHistoryDialog = ({
  entityType,
  entityId,
  entityName,
  open,
  onOpenChange,
}: AssignmentHistoryDialogProps) => {
  const { data: history, isLoading } = useAssignmentHistory(entityType, entityId);
  const { data: dispatcherInfo, isLoading: isLoadingDispatcher } = useDriverDispatcher(entityId, entityType);

  // Calculate tenures based on entity type
  const { driverTenures, trailerTenures, truckTenures } = useMemo(() => {
    if (!history || history.length === 0) {
      return { driverTenures: [], trailerTenures: [], truckTenures: [] };
    }

    return {
      driverTenures: calculateCombinedDriverTenures(history),
      trailerTenures: calculateTenures(history, 'trailer'),
      truckTenures: calculateTenures(history, 'truck'),
    };
  }, [history]);

  // Create dispatcher tenure from current assignment
  const dispatcherTenure: Tenure | null = useMemo(() => {
    if (!dispatcherInfo) return null;
    
    const startDate = dispatcherInfo.driverCreatedAt 
      ? dispatcherInfo.driverCreatedAt.split('T')[0] 
      : new Date().toISOString().split('T')[0];
    
    const startDateObj = new Date(startDate);
    const now = new Date();
    const durationDays = Math.max(1, Math.floor((now.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    
    return {
      entityId: dispatcherInfo.dispatcherId,
      entityName: dispatcherInfo.dispatcherName,
      startDate,
      endDate: null, // Current
      durationDays,
      endReason: null,
      changedByName: null,
      isGap: false,
    };
  }, [dispatcherInfo]);

  const renderTenureContent = (tenures: Tenure[], tenureEntityType: 'driver' | 'truck' | 'trailer') => (
    <ScrollArea className="h-[400px] pr-4">
      <TenureList 
        tenures={tenures} 
        entityType={tenureEntityType}
        emptyMessage={`No ${tenureEntityType} history found`}
      />
    </ScrollArea>
  );

  const renderDispatcherContent = () => (
    <ScrollArea className="h-[400px] pr-4">
      {isLoadingDispatcher ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : dispatcherTenure ? (
        <div className="space-y-3">
          <TenureCard
            tenure={dispatcherTenure}
            entityType="driver"
            icon={<UserCog className="h-4 w-4" />}
          />
          <p className="text-xs text-muted-foreground text-center mt-4">
            Note: Dispatcher assignment history is not tracked. Only the current assignment is shown.
          </p>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No dispatcher assigned
        </div>
      )}
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
              {renderDispatcherContent()}
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
