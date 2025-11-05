import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Truck, Calendar, User, Package, X } from "lucide-react";
import { useRecoveryTrucks } from "@/hooks/useRecoveryTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function Recovery() {
  const { profile } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: recoveryTrucks, isLoading } = useRecoveryTrucks();
  const { data: drivers } = useDrivers();
  const [truckFilter, setTruckFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");

  // Get recovery drivers only
  const recoveryDrivers = useMemo(
    () => drivers?.filter((d) => d.is_recovery && d.is_active) || [],
    [drivers]
  );

  // Group trucks by dispatcher
  const groupedTrucks = useMemo(() => {
    if (!recoveryTrucks) return [];

    // Group by dispatcher
    const dispatcherMap = new Map<string, any[]>();

    recoveryTrucks.forEach((truck) => {
      const dispatcherName = truck.dispatcherName || "Unassigned";
      if (!dispatcherMap.has(dispatcherName)) {
        dispatcherMap.set(dispatcherName, []);
      }
      dispatcherMap.get(dispatcherName)!.push(truck);
    });

    // Convert to array and sort
    return Array.from(dispatcherMap.entries())
      .map(([dispatcher, trucks]) => ({
        dispatcher,
        trucks: trucks.sort((a, b) => a.truck_number.localeCompare(b.truck_number)),
      }))
      .sort((a, b) => a.dispatcher.localeCompare(b.dispatcher));
  }, [recoveryTrucks]);

  // Filter trucks based on search
  const filteredGroups = useMemo(() => {
    if (!truckFilter && !driverFilter) return groupedTrucks;

    return groupedTrucks
      .map((group) => ({
        ...group,
        trucks: group.trucks.filter((truck) => {
          const matchTruck = truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase());
          const matchDriver =
            !driverFilter ||
            truck.currentDriver?.name.toLowerCase().includes(driverFilter.toLowerCase()) ||
            truck.leftByDriver?.name.toLowerCase().includes(driverFilter.toLowerCase());
          return matchTruck && matchDriver;
        }),
      }))
      .filter((group) => group.trucks.length > 0);
  }, [groupedTrucks, truckFilter, driverFilter]);

  const handleAssignDriver = async (truckId: string, driverId: string | null) => {
    try {
      const { error } = await supabase
        .from("trucks")
        .update({ driver1_id: driverId })
        .eq("id", truckId);

      if (error) throw error;

      toast({
        title: driverId ? "Recovery driver assigned" : "Driver unassigned",
        description: driverId
          ? "Recovery driver has been assigned to the truck"
          : "Driver has been removed from the truck",
      });

      queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleMarkComplete = async (truckId: string) => {
    try {
      const { error } = await supabase
        .from("trucks")
        .update({ needs_recovery: false, left_by_driver_id: null })
        .eq("id", truckId);

      if (error) throw error;

      toast({
        title: "Recovery completed",
        description: "Truck has been marked as recovered",
      });

      queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getDaysInRecovery = (enteredDate: string | null) => {
    if (!enteredDate) return null;
    return differenceInDays(new Date(), new Date(enteredDate));
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">🔄 Recovery Management</h1>
          <div className="flex gap-2">
            <Input
              placeholder="Filter by truck..."
              value={truckFilter}
              onChange={(e) => setTruckFilter(e.target.value)}
              className="w-48"
            />
            <Input
              placeholder="Filter by driver..."
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="w-48"
            />
            {(truckFilter || driverFilter) && (
              <Button variant="ghost" size="sm" onClick={() => {
                setTruckFilter("");
                setDriverFilter("");
              }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No trucks in recovery</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredGroups.map((group) => (
              <div key={group.dispatcher} className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Dispatcher Header */}
                <div className="bg-muted/50 px-4 py-3 border-b border-border">
                  <h2 className="text-lg font-bold">
                    {group.dispatcher} ({group.trucks.length} truck{group.trucks.length !== 1 ? "s" : ""})
                  </h2>
                </div>

                {/* Trucks Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Truck #</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Trailer</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Company</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Left By</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Last Load</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Days in Recovery</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Recovery Driver</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.trucks.map((truck) => {
                        const daysInRecovery = getDaysInRecovery(truck.enteredRecoveryDate);
                        const hasRecoveryDriver = !!truck.currentDriver;
                        const isRecoveryLoad = truck.lastLoad?.is_recovery;

                        return (
                          <tr
                            key={truck.id}
                            className={`border-b border-border hover:bg-muted/50 ${
                              isRecoveryLoad ? "bg-purple-500/10" : ""
                            }`}
                          >
                            <td className="px-4 py-3 text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <Truck className="h-4 w-4" />
                                {truck.truck_number}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {truck.trailerNumber ? (
                                <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                  <Package className="h-3 w-3" />
                                  {truck.trailerNumber}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <Badge variant="secondary">{truck.companyName}</Badge>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>{truck.leftByDriver?.name || "Unknown"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {truck.lastLoad ? (
                                <div className="space-y-1">
                                  <div className="font-medium">
                                    #{truck.lastLoad.load_number}
                                    {truck.lastLoad.broker_load_number && (
                                      <span className="text-muted-foreground ml-1">
                                        ({truck.lastLoad.broker_load_number})
                                      </span>
                                    )}
                                  </div>
                                  {isRecoveryLoad && (
                                    <Badge className="bg-purple-600 text-white">RECOVERY</Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {daysInRecovery !== null ? (
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  <span>
                                    {daysInRecovery} day{daysInRecovery !== 1 ? "s" : ""}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <Select
                                value={truck.currentDriver?.id || "none"}
                                onValueChange={(value) =>
                                  handleAssignDriver(truck.id, value === "none" ? null : value)
                                }
                              >
                                <SelectTrigger className="w-48">
                                  <SelectValue placeholder="Select recovery driver..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No driver</SelectItem>
                                  {recoveryDrivers.map((driver) => (
                                    <SelectItem key={driver.id} value={driver.id}>
                                      {driver.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarkComplete(truck.id)}
                              >
                                Mark Complete
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
