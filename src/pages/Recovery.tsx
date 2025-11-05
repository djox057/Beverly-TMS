import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Truck, Calendar, User, Package } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<string>("Čačak");
  const [truckFilter, setTruckFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");

  // Get recovery drivers only
  const recoveryDrivers = useMemo(
    () => drivers?.filter((d) => d.is_recovery && d.is_active) || [],
    [drivers]
  );

  // Group trucks by dispatcher office
  const groupedTrucks = useMemo(() => {
    if (!recoveryTrucks) return {};

    const groups: { [key: string]: any[] } = {
      Čačak: [],
      KRAGUJEVAC: [],
      BEOGRAD: [],
    };

    recoveryTrucks.forEach((truck) => {
      // Determine office based on truck number or company
      let office = "Čačak"; // default
      const truckNum = parseInt(truck.truck_number);

      if (truckNum >= 2000 && truckNum < 3000) {
        office = "Čačak";
      } else if (truckNum >= 3000 && truckNum < 4000) {
        office = "KRAGUJEVAC";
      } else if (truckNum >= 4000) {
        office = "BEOGRAD";
      }

      groups[office].push(truck);
    });

    return groups;
  }, [recoveryTrucks]);

  // Filter trucks based on search
  const filteredTrucks = useMemo(() => {
    const trucks = groupedTrucks[activeTab] || [];
    return trucks.filter((truck) => {
      const matchTruck = truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase());
      const matchDriver =
        !driverFilter ||
        truck.currentDriver?.name.toLowerCase().includes(driverFilter.toLowerCase()) ||
        truck.leftByDriver?.name.toLowerCase().includes(driverFilter.toLowerCase());
      return matchTruck && matchDriver;
    });
  }, [groupedTrucks, activeTab, truckFilter, driverFilter]);

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
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="Čačak">Čačak ({groupedTrucks["Čačak"]?.length || 0})</TabsTrigger>
            <TabsTrigger value="KRAGUJEVAC">
              Kragujevac ({groupedTrucks["KRAGUJEVAC"]?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="BEOGRAD">Beograd ({groupedTrucks["BEOGRAD"]?.length || 0})</TabsTrigger>
          </TabsList>

          {["Čačak", "KRAGUJEVAC", "BEOGRAD"].map((office) => (
            <TabsContent key={office} value={office} className="space-y-4">
              {filteredTrucks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No trucks in recovery for {office}</p>
                </div>
              ) : (
                filteredTrucks.map((truck) => {
                  const daysInRecovery = getDaysInRecovery(truck.enteredRecoveryDate);
                  const hasRecoveryDriver = !!truck.currentDriver;
                  const isRecoveryLoad = truck.lastLoad?.is_recovery;

                  return (
                    <div
                      key={truck.id}
                      className={`border rounded-lg p-4 space-y-3 ${
                        isRecoveryLoad ? "bg-purple-500/10 border-purple-500/30" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                              <Truck className="h-5 w-5" />
                              Truck {truck.truck_number}
                            </h3>
                            {truck.trailerNumber && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Package className="h-3 w-3" />
                                {truck.trailerNumber}
                              </Badge>
                            )}
                            <Badge variant="secondary">{truck.companyName}</Badge>
                            {hasRecoveryDriver && (
                              <Badge className="bg-green-600 text-white">Recovery Assigned</Badge>
                            )}
                            {!hasRecoveryDriver && (
                              <Badge variant="destructive">Needs Recovery</Badge>
                            )}
                          </div>

                          <div className="text-sm text-muted-foreground space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>
                                Left by: <strong>{truck.leftByDriver?.name || "Unknown"}</strong>
                              </span>
                              {daysInRecovery !== null && (
                                <>
                                  <Calendar className="h-4 w-4 ml-2" />
                                  <span>
                                    {daysInRecovery} day{daysInRecovery !== 1 ? "s" : ""} in recovery
                                  </span>
                                </>
                              )}
                            </div>

                            {truck.lastLoad && (
                              <div className="pl-6 text-xs">
                                Last Load: <strong>#{truck.lastLoad.load_number}</strong>
                                {truck.lastLoad.broker_load_number && (
                                  <span> ({truck.lastLoad.broker_load_number})</span>
                                )}
                                {isRecoveryLoad && (
                                  <Badge className="ml-2 bg-purple-600 text-white">RECOVERY</Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
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

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkComplete(truck.id)}
                          >
                            Mark Complete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}
