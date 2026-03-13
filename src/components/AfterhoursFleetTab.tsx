import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Plus, Truck, Trash2, Wand2, ChevronsDownUp, ChevronsUpDown, UserX, ChevronDown, ChevronRight } from "lucide-react";
import { useAfterhoursAssignments, AfterhoursFleet } from "@/hooks/useAfterhoursAssignments";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import AssignAfterhoursDriversDialog from "@/components/AssignAfterhoursDriversDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AfterhoursFleetTabProps {
  hasRole: (role: string) => boolean;
  searchTerm: string;
  dispatcherFilter: string;
  officeFilter: string;
}

const AfterhoursFleetTab: React.FC<AfterhoursFleetTabProps> = ({ hasRole, searchTerm, dispatcherFilter, officeFilter }) => {
  const { afterhoursFleetsByDay, allDriversWithTrucks, weekendDates, loading, assignDriversBulk, removeDriver, removeDriversBulk, autoAssignDrivers, unassignAll } = useAfterhoursAssignments();
  const [assignDialogUserId, setAssignDialogUserId] = useState<string | null>(null);
  const [assignDialogDate, setAssignDialogDate] = useState<string | null>(null);
  const [driverToRemove, setDriverToRemove] = useState<{afterhoursUserId: string; driverId: string; driverName: string; scheduledDate: string;} | null>(null);
  const [selectedForRemoval, setSelectedForRemoval] = useState<Record<string, Set<string>>>({});
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState<{afterhoursUserId: string; count: number; scheduledDate: string;} | null>(null);
  const [autoAssignConfirm, setAutoAssignConfirm] = useState(false);
  const [unassignAllConfirm, setUnassignAllConfirm] = useState(false);
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);

  const canManage = hasRole("admin") || hasRole("manager");

  const filterFleets = (fleets: AfterhoursFleet[]) =>
    fleets.filter((fleet) => {
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

  // Use composite key (userId_date) for selection tracking
  const toggleDriverSelection = (fleetKey: string, driverId: string) => {
    setSelectedForRemoval((prev) => {
      const current = new Set(prev[fleetKey] || []);
      if (current.has(driverId)) current.delete(driverId); else current.add(driverId);
      return { ...prev, [fleetKey]: current };
    });
  };

  const toggleAllDrivers = (fleetKey: string, driverIds: string[]) => {
    setSelectedForRemoval((prev) => {
      const current = new Set(prev[fleetKey] || []);
      const allSelected = driverIds.every((id) => current.has(id));
      if (allSelected) {
        driverIds.forEach((id) => current.delete(id));
      } else {
        driverIds.forEach((id) => current.add(id));
      }
      return { ...prev, [fleetKey]: current };
    });
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
      </div>
    );
  }

  // For assign dialog: find fleet and its already-assigned drivers for that day
  const assignDialogFleet = assignDialogUserId && assignDialogDate
    ? afterhoursFleetsByDay
        .find(d => d.date === assignDialogDate)
        ?.fleets.find(f => f.user.id === assignDialogUserId)
    : null;
  const assignedIdsForDialog = new Set(assignDialogFleet?.drivers.map((d: any) => d.id) || []);

  const hasAnyFleets = afterhoursFleetsByDay.some(d => d.fleets.length > 0);

  return (
    <div className="space-y-4">
      {canManage && hasAnyFleets && (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (allCollapsed) {
                setCollapsedCards(new Set());
                setAllCollapsed(false);
              } else {
                const allKeys = new Set<string>();
                afterhoursFleetsByDay.forEach(d => d.fleets.forEach(f => allKeys.add(`${f.user.id}_${d.date}`)));
                setCollapsedCards(allKeys);
                setAllCollapsed(true);
              }
            }}
          >
            {allCollapsed ? <ChevronsUpDown className="h-4 w-4 sm:mr-1" /> : <ChevronsDownUp className="h-4 w-4 sm:mr-1" />}
            <span className="hidden sm:inline">{allCollapsed ? "Expand All" : "Collapse All"}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setUnassignAllConfirm(true)}
            disabled={loading}
          >
            <UserX className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Unassign All</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoAssignConfirm(true)}
            disabled={loading}
          >
            <Wand2 className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Auto Assign</span>
          </Button>
        </div>
      )}

      {afterhoursFleetsByDay.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No weekend dispatchers found.
          </CardContent>
        </Card>
      )}

      {afterhoursFleetsByDay.map((dayData) => {
        const filteredFleets = filterFleets(dayData.fleets);
        if (filteredFleets.length === 0) return null;

        return (
          <div key={dayData.date} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                {dayData.dayName} — {new Date(dayData.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </h3>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTestSms(dayData.date)}
                  disabled={sendingSms === dayData.date}
                >
                  <MessageSquare className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">{sendingSms === dayData.date ? "Sending..." : "Test SMS"}</span>
                </Button>
              )}
            </div>

            {filteredFleets.map((fleet) => {
              const filteredDrivers = filterDriversBySearch(fleet.drivers);
              const fleetKey = `${fleet.user.id}_${dayData.date}`;
              const selected = selectedForRemoval[fleetKey] || new Set<string>();
              const selectedCount = selected.size;
              const allFilteredSelected = filteredDrivers.length > 0 && filteredDrivers.every((d: any) => selected.has(d.id));

              return (
                <Card key={fleetKey}>
                  <CardHeader
                    className="p-3 sm:p-6 cursor-pointer select-none"
                    onClick={() => {
                      setCollapsedCards(prev => {
                        const next = new Set(prev);
                        if (next.has(fleetKey)) next.delete(fleetKey); else next.add(fleetKey);
                        return next;
                      });
                    }}
                  >
                    <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {collapsedCards.has(fleetKey)
                          ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                        <span className="text-sm sm:text-base">
                          {fleet.user.full_name || fleet.user.email}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {fleet.drivers.length} drivers
                        </Badge>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {selectedCount > 0 && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setBulkRemoveConfirm({ afterhoursUserId: fleet.user.id, count: selectedCount, scheduledDate: dayData.date })}
                            >
                              <Trash2 className="h-4 w-4 sm:mr-1" />
                              <span className="hidden sm:inline">Remove {selectedCount}</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setAssignDialogUserId(fleet.user.id); setAssignDialogDate(dayData.date); }}
                          >
                            <Plus className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Add Drivers</span>
                          </Button>
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  {!collapsedCards.has(fleetKey) && (
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {filteredDrivers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        {searchTerm ? "No matching drivers" : "No drivers assigned yet"}
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {canManage && filteredDrivers.length > 1 && (
                          <label className="flex items-center gap-2 px-2 py-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                            <Checkbox
                              checked={allFilteredSelected}
                              onCheckedChange={() => toggleAllDrivers(fleetKey, filteredDrivers.map((d: any) => d.id))}
                            />
                            Select all
                          </label>
                        )}
                        {filteredDrivers.map((driver: any) => (
                          <div
                            key={driver.id}
                            className="flex items-center justify-between p-2 sm:p-3 border rounded-lg"
                          >
                            <div className="flex items-center gap-2 sm:gap-3">
                              {canManage && (
                                <Checkbox
                                  checked={selected.has(driver.id)}
                                  onCheckedChange={() => toggleDriverSelection(fleetKey, driver.id)}
                                />
                              )}
                              <Truck className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                              <div>
                                <div className="text-xs sm:text-sm font-medium">{driver.name}</div>
                                <div className="text-[10px] sm:text-xs text-muted-foreground flex gap-2">
                                  {driver.truck && <span>Truck {driver.truck.truck_number}</span>}
                                  {driver.dispatcher_name && <span>• {driver.dispatcher_name}</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        );
      })}

      {/* Assign drivers dialog */}
      <AssignAfterhoursDriversDialog
        open={!!assignDialogUserId}
        onOpenChange={(open) => { if (!open) { setAssignDialogUserId(null); setAssignDialogDate(null); } }}
        allDrivers={allDriversWithTrucks}
        alreadyAssignedIds={assignedIdsForDialog}
        onAssign={async (driverIds) => {
          if (assignDialogUserId && assignDialogDate) {
            await assignDriversBulk(assignDialogUserId, driverIds, assignDialogDate);
          }
        }}
      />

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
                  removeDriver(driverToRemove.afterhoursUserId, driverToRemove.driverId, driverToRemove.scheduledDate);
                  setDriverToRemove(null);
                }
              }}
            >
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
                  const fleetKey = `${bulkRemoveConfirm.afterhoursUserId}_${bulkRemoveConfirm.scheduledDate}`;
                  const ids = Array.from(selectedForRemoval[fleetKey] || []);
                  await removeDriversBulk(bulkRemoveConfirm.afterhoursUserId, ids, bulkRemoveConfirm.scheduledDate);
                  setSelectedForRemoval((prev) => {
                    const next = { ...prev };
                    delete next[fleetKey];
                    return next;
                  });
                  setBulkRemoveConfirm(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto assign confirmation */}
      <AlertDialog open={autoAssignConfirm} onOpenChange={setAutoAssignConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auto Assign Drivers</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all current weekend assignments and automatically distribute drivers to weekend dispatchers per day by office. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setAutoAssignConfirm(false);
                await autoAssignDrivers();
              }}
            >
              Auto Assign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unassign all confirmation */}
      <AlertDialog open={unassignAllConfirm} onOpenChange={setUnassignAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign All Drivers</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all driver assignments from all weekend dispatchers. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setUnassignAllConfirm(false);
                await unassignAll();
              }}
            >
              Unassign All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AfterhoursFleetTab;
