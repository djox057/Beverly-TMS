import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Plus, Minus, Truck } from "lucide-react";
import { useAfterhoursAssignments } from "@/hooks/useAfterhoursAssignments";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface AfterhoursFleetTabProps {
  hasRole: (role: string) => boolean;
  searchTerm: string;
  dispatcherFilter: string;
  officeFilter: string;
}

const AfterhoursFleetTab: React.FC<AfterhoursFleetTabProps> = ({ hasRole, searchTerm, dispatcherFilter, officeFilter }) => {
  const { afterhoursFleets, allDriversWithTrucks, loading, assignDriver, removeDriver } = useAfterhoursAssignments();
  const [selectedDriver, setSelectedDriver] = useState("");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [driverToRemove, setDriverToRemove] = useState<{afterhoursUserId: string;driverId: string;driverName: string;} | null>(null);

  const canManage = hasRole("admin") || hasRole("manager");

  const filteredFleets = afterhoursFleets.filter((fleet) => {
    if (officeFilter !== "all") {
      const office = fleet.user.office || "";
      if (office.toLowerCase() !== officeFilter.toLowerCase()) return false;
    }
    if (dispatcherFilter) {
      const name = fleet.user.full_name || fleet.user.email || "";
      if (!name.toLowerCase().includes(dispatcherFilter.toLowerCase())) return false;
    }
    return true;
  });

  const filterDriversBySearch = (drivers: any[]) => {
    if (!searchTerm) return drivers;
    const lower = searchTerm.toLowerCase();
    return drivers.filter((d) =>
    d.name?.toLowerCase().includes(lower) ||
    d.truck?.truck_number?.toString().toLowerCase().includes(lower)
    );
  };

  const handleAssign = async (afterhoursUserId: string) => {
    if (!selectedDriver) return;
    await assignDriver(afterhoursUserId, selectedDriver);
    setSelectedDriver("");
    setActiveUserId(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) =>
        <Card key={i}>
            <CardHeader className="p-3 sm:p-6">
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="space-y-2">
                {[1, 2, 3].map((j) =>
              <Skeleton key={j} className="h-12 w-full" />
              )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>);

  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      





















      

      {filteredFleets.length === 0 &&
      <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No afterhours dispatchers found.
          </CardContent>
        </Card>
      }

      {filteredFleets.map((fleet) => {
        const filteredDrivers = filterDriversBySearch(fleet.drivers);
        const assignedDriverIds = new Set(fleet.drivers.map((d) => d.id));

        // Available drivers = all active drivers not yet assigned to this afterhours user
        const availableForAssign = allDriversWithTrucks.
        filter((d) => !assignedDriverIds.has(d.id)).
        map((d) => ({
          value: d.id,
          label: `${d.name}${d.truck ? ` - Truck ${d.truck.truck_number}` : ""}${d.dispatcher_name ? ` (${d.dispatcher_name})` : ""}`
        }));

        return (
          <Card key={fleet.user.id}>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Moon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <span className="text-sm sm:text-base">
                    {fleet.user.full_name || fleet.user.email}
                  </span>
                  {fleet.user.office &&
                  <Badge variant="outline" className="text-xs">
                      {fleet.user.office}
                    </Badge>
                  }
                  <Badge variant="secondary" className="text-xs">
                    {fleet.drivers.length} drivers
                  </Badge>
                </div>

                {canManage &&
                <div className="flex items-center gap-2">
                    {activeUserId === fleet.user.id ?
                  <div className="flex items-center gap-2">
                        <Combobox
                      options={availableForAssign}
                      value={selectedDriver}
                      onValueChange={setSelectedDriver}
                      placeholder="Select driver..."
                      searchPlaceholder="Search drivers..."
                      emptyText="No drivers available."
                      className="w-[250px]" />
                    
                        <Button
                      size="sm"
                      onClick={() => handleAssign(fleet.user.id)}
                      disabled={!selectedDriver}>
                      
                          Assign
                        </Button>
                        <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {setActiveUserId(null);setSelectedDriver("");}}>
                      
                          Cancel
                        </Button>
                      </div> :

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveUserId(fleet.user.id)}>
                    
                        <Plus className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Add Driver</span>
                      </Button>
                  }
                  </div>
                }
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              {filteredDrivers.length === 0 ?
              <p className="text-sm text-muted-foreground py-2">
                  {searchTerm ? "No matching drivers" : "No drivers assigned yet"}
                </p> :

              <div className="grid gap-2">
                  {filteredDrivers.map((driver: any) =>
                <div
                  key={driver.id}
                  className="flex items-center justify-between p-2 sm:p-3 border rounded-lg">
                  
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Truck className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium">{driver.name}</div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground flex gap-2">
                            {driver.truck && <span>Truck {driver.truck.truck_number}</span>}
                            {driver.dispatcher_name && <span>• {driver.dispatcher_name}</span>}
                          </div>
                        </div>
                      </div>
                      {canManage &&
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 sm:h-8 text-destructive hover:text-destructive"
                    onClick={() => setDriverToRemove({
                      afterhoursUserId: fleet.user.id,
                      driverId: driver.id,
                      driverName: driver.name
                    })}>
                    
                          <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline ml-1">Remove</span>
                        </Button>
                  }
                    </div>
                )}
                </div>
              }
            </CardContent>
          </Card>);

      })}

      {/* Remove confirmation */}
      <AlertDialog open={!!driverToRemove} onOpenChange={(open) => !open && setDriverToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Driver</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {driverToRemove?.driverName} from this afterhours dispatcher?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (driverToRemove) {
                removeDriver(driverToRemove.afterhoursUserId, driverToRemove.driverId);
                setDriverToRemove(null);
              }
            }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>);

};

export default AfterhoursFleetTab;