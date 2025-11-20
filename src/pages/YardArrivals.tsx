import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wrench, TruckIcon } from "lucide-react";
import { format } from "date-fns";

interface YardAction {
  id: string;
  driver_id: string;
  action_type: "maintenance" | "return_truck";
  comment: string;
  created_at: string;
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
  });

  const maintenanceActions = yardActions?.filter((a) => a.action_type === "maintenance") || [];
  const returnTruckActions = yardActions?.filter((a) => a.action_type === "return_truck") || [];

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
                      <div>
                        <p className="font-semibold">
                          {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Truck: {action.truck?.truck_number || "N/A"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(action.created_at), "MMM d, yyyy HH:mm")}
                      </p>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <p className="text-sm font-medium mb-1">Comment:</p>
                      <p className="text-sm">{action.comment}</p>
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
                      <div>
                        <p className="font-semibold">
                          {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Truck: {action.truck?.truck_number || "N/A"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(action.created_at), "MMM d, yyyy HH:mm")}
                      </p>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <p className="text-sm font-medium mb-1">Comment:</p>
                      <p className="text-sm">{action.comment}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
