import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarDays,
  Plus,
  Truck,
  Trash2,
  ChevronsDownUp,
  ChevronsUpDown,
  UserX,
  ChevronDown,
  ChevronRight,
  Moon,
  Sunrise,
} from "lucide-react";
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
import AssignAfterhoursDriversDialog from "@/components/AssignAfterhoursDriversDialog";
import { useAfterhoursShiftAssignments, ShiftFleet, ShiftKey } from "@/hooks/useAfterhoursShiftAssignments";

interface Props {
  hasRole: (role: string) => boolean;
  searchTerm: string;
  dispatcherFilter: string;
  officeFilter: string;
}

const SHIFT_LABEL: Record<ShiftKey, { label: string; hours: string; icon: typeof Moon }> = {
  night: { label: "Night shift", hours: "10 PM – 6 AM", icon: Moon },
  morning: { label: "Morning shift", hours: "6 AM – 2 PM", icon: Sunrise },
};

const AfterhoursShiftFleetTab: React.FC<Props> = ({ hasRole, searchTerm, dispatcherFilter, officeFilter }) => {
  const { shiftFleetsByDay, allDriversWithTrucks, loading, assignDriversBulk, removeDriversBulk, unassignAll } =
    useAfterhoursShiftAssignments();

  const [assignTarget, setAssignTarget] = useState<{ userId: string; date: string; shift: ShiftKey } | null>(null);
  const [selectedForRemoval, setSelectedForRemoval] = useState<Record<string, Set<string>>>({});
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState<{
    userId: string;
    date: string;
    shift: ShiftKey;
    count: number;
  } | null>(null);
  const [unassignAllConfirm, setUnassignAllConfirm] = useState(false);
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);

  const canManage = hasRole("admin") || hasRole("manager");

  const filterFleets = (fleets: ShiftFleet[]) =>
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
    return drivers.filter(
      (d) =>
        d.name?.toLowerCase().includes(lower) || d.truck?.truck_number?.toString().toLowerCase().includes(lower),
    );
  };

  const toggleDriverSelection = (fleetKey: string, driverId: string) => {
    setSelectedForRemoval((prev) => {
      const current = new Set(prev[fleetKey] || []);
      if (current.has(driverId)) current.delete(driverId);
      else current.add(driverId);
      return { ...prev, [fleetKey]: current };
    });
  };

  const toggleAllDrivers = (fleetKey: string, driverIds: string[]) => {
    setSelectedForRemoval((prev) => {
      const current = new Set(prev[fleetKey] || []);
      const allSelected = driverIds.every((id) => current.has(id));
      if (allSelected) driverIds.forEach((id) => current.delete(id));
      else driverIds.forEach((id) => current.add(id));
      return { ...prev, [fleetKey]: current };
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="p-3 sm:p-6">
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="space-y-2">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const assignFleet = assignTarget
    ? shiftFleetsByDay
        .find((d) => d.date === assignTarget.date)
        ?.groups.find((g) => g.shift === assignTarget.shift)
        ?.fleets.find((f) => f.user.id === assignTarget.userId)
    : null;
  const assignedIdsForDialog = new Set(assignFleet?.drivers.map((d: any) => d.id) || []);

  const hasAnyFleets = shiftFleetsByDay.some((d) => d.groups.some((g) => g.fleets.length > 0));

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
                shiftFleetsByDay.forEach((d) =>
                  d.groups.forEach((g) => g.fleets.forEach((f) => allKeys.add(`${f.user.id}_${d.date}_${g.shift}`))),
                );
                setCollapsedCards(allKeys);
                setAllCollapsed(true);
              }
            }}
          >
            {allCollapsed ? (
              <ChevronsUpDown className="h-4 w-4 sm:mr-1" />
            ) : (
              <ChevronsDownUp className="h-4 w-4 sm:mr-1" />
            )}
            <span className="hidden sm:inline">{allCollapsed ? "Expand All" : "Collapse All"}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setUnassignAllConfirm(true)}
          >
            <UserX className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Unassign All</span>
          </Button>
        </div>
      )}

      {shiftFleetsByDay.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No afterhours shifts scheduled. Use the "Afterhours Shifts" button to schedule people for night and
            morning shifts.
          </CardContent>
        </Card>
      )}

      {shiftFleetsByDay.map((dayData) => (
        <div key={dayData.date} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {dayData.dayName} —{" "}
            {new Date(dayData.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </h3>

          {dayData.groups.map((group) => {
            const filteredFleets = filterFleets(group.fleets);
            if (filteredFleets.length === 0) return null;
            const meta = SHIFT_LABEL[group.shift];
            const ShiftIcon = meta.icon;

            return (
              <div key={group.shift} className="space-y-2 pl-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs gap-1">
                    <ShiftIcon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{meta.hours}</span>
                </div>

                {filteredFleets.map((fleet) => {
                  const filteredDrivers = filterDriversBySearch(fleet.drivers);
                  const fleetKey = `${fleet.user.id}_${dayData.date}_${group.shift}`;
                  const selected = selectedForRemoval[fleetKey] || new Set<string>();
                  const selectedCount = selected.size;
                  const allFilteredSelected =
                    filteredDrivers.length > 0 && filteredDrivers.every((d: any) => selected.has(d.id));

                  return (
                    <Card key={fleetKey}>
                      <CardHeader
                        className="p-3 sm:p-6 cursor-pointer select-none"
                        onClick={() => {
                          setCollapsedCards((prev) => {
                            const next = new Set(prev);
                            if (next.has(fleetKey)) next.delete(fleetKey);
                            else next.add(fleetKey);
                            return next;
                          });
                        }}
                      >
                        <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {collapsedCards.has(fleetKey) ? (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="text-sm sm:text-base">{fleet.user.full_name || fleet.user.email}</span>
                            {fleet.user.isManager && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                Manager
                              </Badge>
                            )}
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
                                  onClick={() =>
                                    setBulkRemoveConfirm({
                                      userId: fleet.user.id,
                                      date: dayData.date,
                                      shift: group.shift,
                                      count: selectedCount,
                                    })
                                  }
                                >
                                  <Trash2 className="h-4 w-4 sm:mr-1" />
                                  <span className="hidden sm:inline">Remove {selectedCount}</span>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setAssignTarget({ userId: fleet.user.id, date: dayData.date, shift: group.shift })
                                }
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
                                    onCheckedChange={() =>
                                      toggleAllDrivers(
                                        fleetKey,
                                        filteredDrivers.map((d: any) => d.id),
                                      )
                                    }
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
        </div>
      ))}

      <AssignAfterhoursDriversDialog
        open={!!assignTarget}
        onOpenChange={(open) => {
          if (!open) setAssignTarget(null);
        }}
        allDrivers={allDriversWithTrucks}
        alreadyAssignedIds={assignedIdsForDialog}
        onAssign={async (driverIds) => {
          if (assignTarget) {
            await assignDriversBulk(assignTarget.userId, driverIds, assignTarget.date, assignTarget.shift);
          }
        }}
      />

      <AlertDialog open={!!bulkRemoveConfirm} onOpenChange={(open) => !open && setBulkRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {bulkRemoveConfirm?.count} Drivers</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {bulkRemoveConfirm?.count} selected driver{bulkRemoveConfirm?.count !== 1 ? "s" : ""} from this
              shift?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (bulkRemoveConfirm) {
                  const fleetKey = `${bulkRemoveConfirm.userId}_${bulkRemoveConfirm.date}_${bulkRemoveConfirm.shift}`;
                  const ids = Array.from(selectedForRemoval[fleetKey] || []);
                  await removeDriversBulk(
                    bulkRemoveConfirm.userId,
                    ids,
                    bulkRemoveConfirm.date,
                    bulkRemoveConfirm.shift,
                  );
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

      <AlertDialog open={unassignAllConfirm} onOpenChange={setUnassignAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign All Drivers</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all driver assignments from every afterhours shift in the current window. Continue?
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

export default AfterhoursShiftFleetTab;
