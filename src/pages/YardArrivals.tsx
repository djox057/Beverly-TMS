import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Wrench, TruckIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format as formatDate } from "date-fns";
import { useState } from "react";

interface YardAction {
  id: string;
  driver_id: string;
  action_type: "maintenance" | "return_truck";
  comment: string;
  created_at: string;
  arrival_datetime: string | null;
  created_by: string | null;
  driver: {
    name: string;
    first_name: string;
    last_name: string;
  } | null;
  truck: {
    truck_number: string;
  } | null;
}

export default function YardArrivals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [actionToCancel, setActionToCancel] = useState<{ id: string; driverId: string; driverName: string } | null>(null);

  const { data: yardActions, isLoading } = useQuery({
    queryKey: ["yard-arrivals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_yard_actions")
        .select(`
          id,
          driver_id,
          action_type,
          comment,
          created_at,
          arrival_datetime,
          created_by,
          drivers!driver_yard_actions_driver_id_fkey (
            name,
            first_name,
            last_name
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch truck information for each driver
      const actionsWithTrucks = await Promise.all(
        (data || []).map(async (action) => {
          const { data: truckData } = await supabase
            .from("trucks")
            .select("truck_number")
            .eq("driver1_id", action.driver_id)
            .maybeSingle();

          return {
            ...action,
            driver: action.drivers,
            truck: truckData,
          };
        })
      );

      return actionsWithTrucks as YardAction[];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const maintenanceActions = yardActions?.filter((a) => a.action_type === "maintenance") || [];
  const returnTruckActions = yardActions?.filter((a) => a.action_type === "return_truck") || [];

  const handleCancelAction = async () => {
    if (!actionToCancel) return;

    try {
      // Delete the yard action
      await supabase.from("driver_yard_actions").delete().eq("id", actionToCancel.id);

      // Remove going_yard status from driver
      await supabase.from("drivers").update({ going_yard: false }).eq("id", actionToCancel.driverId);

      toast({
        title: "Yard arrival canceled",
      });
      queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
    } catch (error) {
      console.error("Error canceling yard action:", error);
      toast({
        title: "Error",
        description: "Failed to cancel yard arrival",
        variant: "destructive",
      });
    } finally {
      setCancelDialogOpen(false);
      setActionToCancel(null);
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "N/A";
    // Format as MM/DD/YYYY HH:mm without timezone conversion
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${month}/${day}/${year} ${hours}:${minutes}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Yard Arrivals</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Maintenance Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Maintenance ({maintenanceActions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {maintenanceActions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No maintenance arrivals</p>
            ) : (
              <div className="space-y-4">
                {maintenanceActions.map((action) => (
                  <div key={action.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <p className="font-semibold">
                          #{action.truck?.truck_number || "N/A"} {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Time of arrival: {formatDateTime(action.arrival_datetime || action.created_at)}
                        </p>
                        <div className="pt-1">
                          <p className="text-sm"><span className="font-medium">Reason:</span> {action.comment}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActionToCancel({
                            id: action.id,
                            driverId: action.driver_id,
                            driverName: action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`,
                          });
                          setCancelDialogOpen(true);
                        }}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Return Truck Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TruckIcon className="h-5 w-5" />
              Returning Truck ({returnTruckActions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {returnTruckActions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No truck returns</p>
            ) : (
              <div className="space-y-4">
                {returnTruckActions.map((action) => (
                  <div key={action.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <p className="font-semibold">
                          #{action.truck?.truck_number || "N/A"} {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Time of arrival: {formatDateTime(action.arrival_datetime || action.created_at)}
                        </p>
                        <div className="pt-1">
                          <p className="text-sm"><span className="font-medium">Reason:</span> {action.comment}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActionToCancel({
                            id: action.id,
                            driverId: action.driver_id,
                            driverName: action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`,
                          });
                          setCancelDialogOpen(true);
                        }}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Yard Arrival</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the yard arrival for {actionToCancel?.driverName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setActionToCancel(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelAction} className="bg-destructive hover:bg-destructive/90">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
