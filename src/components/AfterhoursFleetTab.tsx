import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Plus, Minus, Truck, Trash2 } from "lucide-react";
import { useAfterhoursAssignments } from "@/hooks/useAfterhoursAssignments";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import AssignAfterhoursDriversDialog from "@/components/AssignAfterhoursDriversDialog";

interface AfterhoursFleetTabProps {
  hasRole: (role: string) => boolean;
  searchTerm: string;
  dispatcherFilter: string;
  officeFilter: string;
}

const AfterhoursFleetTab: React.FC<AfterhoursFleetTabProps> = ({ hasRole, searchTerm, dispatcherFilter, officeFilter }) => {
  const { afterhoursFleets, allDriversWithTrucks, loading, assignDriversBulk, removeDriver, removeDriversBulk } = useAfterhoursAssignments();
  const [assignDialogUserId, setAssignDialogUserId] = useState<string | null>(null);
  const [driverToRemove, setDriverToRemove] = useState<{afterhoursUserId: string;driverId: string;driverName: string;} | null>(null);
  // Per-fleet selected driver IDs for bulk remove
  const [selectedForRemoval, setSelectedForRemoval] = useState<Record<string, Set<string>>>({});
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState<{afterhoursUserId: string;count: number;} | null>(null);

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

  const toggleDriverSelection = (fleetId: string, driverId: string) => {
    setSelectedForRemoval((prev) => {
      const current = new Set(prev[fleetId] || []);
      if (current.has(driverId)) current.delete(driverId);else
      current.add(driverId);
      return { ...prev, [fleetId]: current };
    });
  };

  const toggleAllDrivers = (fleetId: string, driverIds: string[]) => {
    setSelectedForRemoval((prev) => {
      const current = new Set(prev[fleetId] || []);
      const allSelected = driverIds.every((id) => current.has(id));
      if (allSelected) {
        driverIds.forEach((id) => current.delete(id));
      } else {
        driverIds.forEach((id) => current.add(id));
      }
      return { ...prev, [fleetId]: current };
    });
  };

  const getSelectedCount = (fleetId: string) => selectedForRemoval[fleetId]?.size || 0;

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

  const assignDialogFleet = assignDialogUserId ?
  afterhoursFleets.find((f) => f.user.id === assignDialogUserId) :
  null;
  const assignedIdsForDialog = new Set(assignDialogFleet?.drivers.map((d: any) => d.id) || []);

  return (
    <div className="space-y-4">
      {filteredFleets.length === 0 &&
      <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No weekend dispatchers found.
          </CardContent>
        </Card>
      }

      {filteredFleets.map((fleet) => {
        const filteredDrivers = filterDriversBySearch(fleet.drivers);
        const fleetId = fleet.user.id;
        const selected = selectedForRemoval[fleetId] || new Set<string>();
        const selectedCount = selected.size;
        const allFilteredSelected = filteredDrivers.length > 0 && filteredDrivers.every((d: any) => selected.has(d.id));

        return (
          <Card key={fleetId}>
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
                    {selectedCount > 0 &&
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setBulkRemoveConfirm({ afterhoursUserId: fleetId, count: selectedCount })}>
                    
                        <Trash2 className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Remove {selectedCount}</span>
                      </Button>
                  }
                    <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAssignDialogUserId(fleetId)}>
                    
                      <Plus className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Add Drivers</span>
                    </Button>
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
                  {/* Select all row */}
                  {canManage && filteredDrivers.length > 1 &&
                <label className="flex items-center gap-2 px-2 py-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={() => toggleAllDrivers(fleetId, filteredDrivers.map((d: any) => d.id))} />
                  
                      Select all
                    </label>
                }
                  {filteredDrivers.map((driver: any) =>
                <div
                  key={driver.id}
                  className="flex items-center justify-between p-2 sm:p-3 border rounded-lg">
                  
                      <div className="flex items-center gap-2 sm:gap-3">
                        {canManage &&
                    <Checkbox
                      checked={selected.has(driver.id)}
                      onCheckedChange={() => toggleDriverSelection(fleetId, driver.id)} />

                    }
                        <Truck className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium">{driver.name}</div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground flex gap-2">
                            {driver.truck && <span>Truck {driver.truck.truck_number}</span>}
                            {driver.dispatcher_name && <span>• {driver.dispatcher_name}</span>}
                          </div>
                        </div>
                      </div>
                      {canManage















                  }
                    </div>
                )}
                </div>
              }
            </CardContent>
          </Card>);

      })}

      {/* Assign drivers dialog */}
      <AssignAfterhoursDriversDialog
        open={!!assignDialogUserId}
        onOpenChange={(open) => !open && setAssignDialogUserId(null)}
        allDrivers={allDriversWithTrucks}
        alreadyAssignedIds={assignedIdsForDialog}
        onAssign={async (driverIds) => {
          if (assignDialogUserId) {
            await assignDriversBulk(assignDialogUserId, driverIds);
          }
        }} />
      

      {/* Single remove confirmation */}
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
            <AlertDialogAction
              onClick={() => {
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

      {/* Bulk remove confirmation */}
      <AlertDialog open={!!bulkRemoveConfirm} onOpenChange={(open) => !open && setBulkRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {bulkRemoveConfirm?.count} Drivers</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {bulkRemoveConfirm?.count} selected driver{bulkRemoveConfirm?.count !== 1 ? "s" : ""} from this afterhours dispatcher?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (bulkRemoveConfirm) {
                  const ids = Array.from(selectedForRemoval[bulkRemoveConfirm.afterhoursUserId] || []);
                  await removeDriversBulk(bulkRemoveConfirm.afterhoursUserId, ids);
                  setSelectedForRemoval((prev) => {
                    const next = { ...prev };
                    delete next[bulkRemoveConfirm.afterhoursUserId];
                    return next;
                  });
                  setBulkRemoveConfirm(null);
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