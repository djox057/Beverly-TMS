import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
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
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Truck,
  Plus,
  Minus,
  Users,
  UserCheck,
  GripVertical,
  Search,
  Info,
  ArrowRightLeft,
  CalendarDays,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { Label } from "@/components/ui/label";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useAuthContext } from "@/contexts/AuthContext";
import { AfterhoursScheduleDialog } from "@/components/AfterhoursScheduleDialog";
import { supabase } from "@/integrations/supabase/client";
const Fleets = () => {
  const { hasRole } = useAuthContext();
  const {
    dispatchers,
    availableDrivers,
    allDispatchers,
    assignedTrucksCount,
    unassignedTrucksCount,
    loading,
    assignDriverToDispatcher,
    removeDriverFromDispatcher,
    setDispatcherOffDuty,
    setDispatcherActive,
  } = useFleetManagement();

  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedDispatcher, setSelectedDispatcher] = useState("");
  const [isAssignDriverOpen, setIsAssignDriverOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dispatcherFilter, setDispatcherFilter] = useState("");
  const [currentPages, setCurrentPages] = useState<Record<string, number>>({});
  const [driverToRemove, setDriverToRemove] = useState<string | null>(null);
  const [driverToSwitch, setDriverToSwitch] = useState<{ driverIds: string[]; currentDispatcherId: string } | null>(
    null,
  );
  const [dispatcherToToggle, setDispatcherToToggle] = useState<{
    id: string;
    name: string;
    drivers: any[];
  } | null>(null);
  const [driverCoverAssignments, setDriverCoverAssignments] = useState<Record<string, string>>({});
  const [isAfterhoursScheduleOpen, setIsAfterhoursScheduleOpen] = useState(false);

  const itemsPerPage = 12;

  // Filter drivers by search term
  const filterDrivers = (drivers: any[]) => {
    if (!searchTerm) return drivers;
    const searchLower = searchTerm.toLowerCase();
    return drivers.filter((driver) => {
      const nameMatch = driver?.name?.toLowerCase().includes(searchLower);
      const truckMatch = driver?.truck?.truck_number?.toString().toLowerCase().includes(searchLower);
      return nameMatch || truckMatch;
    });
  };

  // Filter dispatchers by name
  const filterDispatchers = (dispatcherFleets: any[]) => {
    if (!dispatcherFilter) return dispatcherFleets;
    return dispatcherFleets.filter((fleet) => {
      const name = fleet.dispatcher.full_name || fleet.dispatcher.email || "";
      return name.toLowerCase().includes(dispatcherFilter.toLowerCase());
    });
  };

  // Get paginated drivers
  const getPaginatedDrivers = (drivers: any[], pageKey: string) => {
    const currentPage = currentPages[pageKey] || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      drivers: drivers.slice(startIndex, endIndex),
      totalPages: Math.ceil(drivers.length / itemsPerPage),
      currentPage,
    };
  };

  const setPage = (pageKey: string, page: number) => {
    setCurrentPages((prev) => ({ ...prev, [pageKey]: page }));
  };

  const handleAssignDriver = async () => {
    if (selectedDriver && selectedDispatcher) {
      await assignDriverToDispatcher(selectedDriver, selectedDispatcher);
      setSelectedDriver("");
      setSelectedDispatcher("");
      setIsAssignDriverOpen(false);
    }
  };

  const handleRemoveDriver = async (driverId: string) => {
    setDriverToRemove(driverId);
  };

  const confirmRemoveDriver = async () => {
    if (driverToRemove) {
      await removeDriverFromDispatcher(driverToRemove);
      setDriverToRemove(null);
    }
  };

  const handleSwitchDispatcher = async () => {
    if (driverToSwitch && selectedDispatcher) {
      // Switch all drivers in the array
      for (const driverId of driverToSwitch.driverIds) {
        await assignDriverToDispatcher(driverId, selectedDispatcher);
      }
      setDriverToSwitch(null);
      setSelectedDispatcher("");
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // If no destination or dropped in same place, do nothing
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) {
      return;
    }

    const driverId = draggableId;

    // Handle different drop destinations
    if (destination.droppableId === "unassigned") {
      // Remove driver from dispatcher
      await removeDriverFromDispatcher(driverId);
    } else if (destination.droppableId.startsWith("dispatcher-")) {
      // Assign driver to dispatcher
      const dispatcherId = destination.droppableId.replace("dispatcher-", "");
      await assignDriverToDispatcher(driverId, dispatcherId);
    }
  };

  const handleToggleDispatcher = (dispatcherId: string, dispatcherName: string, drivers: any[]) => {
    // Initialize cover assignments to empty
    const initialAssignments: Record<string, string> = {};
    drivers.forEach((driver) => {
      initialAssignments[driver.id] = "";
    });
    setDriverCoverAssignments(initialAssignments);

    // Show confirmation dialog for setting OFF DUTY
    setDispatcherToToggle({
      id: dispatcherId,
      name: dispatcherName,
      drivers: drivers,
    });
  };

  const confirmToggleOffDuty = async () => {
    if (!dispatcherToToggle) return;

    // Validate all drivers have cover dispatchers assigned
    const hasUnassigned = Object.values(driverCoverAssignments).some((v) => !v);
    if (hasUnassigned) {
      return; // Don't proceed if not all drivers have cover
    }

    await setDispatcherOffDuty(dispatcherToToggle.id, driverCoverAssignments);
    setDispatcherToToggle(null);
    setDriverCoverAssignments({});
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b bg-background px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-6 w-6" />
              <h1 className="text-2xl font-bold">Dispatcher Fleet Management</h1>
            </div>
            <Skeleton className="h-10 w-[240px]" />
          </div>
          <div className="flex gap-3 max-w-2xl">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Fleet Summary Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-12" />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Dispatcher Fleet Skeletons */}
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-5" />
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-9 w-32" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <div key={j} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-4 w-4" />
                          <Skeleton className="h-4 w-4" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Skeleton className="h-8 w-20" />
                          <Skeleton className="h-8 w-20" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b bg-background px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-6 w-6" />
              <h1 className="text-2xl font-bold">Dispatcher Fleet Management</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsAfterhoursScheduleOpen(true)}>
                <CalendarDays className="h-4 w-4 mr-2" />
                Weekend Schedule
              </Button>
              <Dialog open={isAssignDriverOpen} onOpenChange={setIsAssignDriverOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Assign Driver to Dispatcher
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Driver to Dispatcher</DialogTitle>
                    <DialogDescription>
                      Select a driver and dispatcher to assign, or simply drag and drop!
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Select Driver</Label>
                      <Combobox
                        options={availableDrivers.map((driver) => ({
                          value: driver.id,
                          label: `${driver.name}${driver.truck ? ` - Truck ${driver.truck.truck_number}` : ""}`,
                        }))}
                        value={selectedDriver}
                        onValueChange={setSelectedDriver}
                        placeholder="Search drivers..."
                        emptyText="No driver found."
                        searchPlaceholder="Search by name or truck..."
                      />
                    </div>
                    <div>
                      <Label>Select Dispatcher</Label>
                      <Combobox
                        options={allDispatchers.map((dispatcher) => ({
                          value: dispatcher.id,
                          label: `${dispatcher.full_name || dispatcher.email}${dispatcher.ext ? ` (ext ${dispatcher.ext})` : ""}`,
                        }))}
                        value={selectedDispatcher}
                        onValueChange={setSelectedDispatcher}
                        placeholder="Search dispatchers..."
                        emptyText="No dispatcher found."
                        searchPlaceholder="Search by name..."
                      />
                    </div>
                    <Button
                      onClick={handleAssignDriver}
                      className="w-full"
                      disabled={!selectedDriver || !selectedDispatcher}
                    >
                      Assign Driver
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="flex gap-3 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search drivers by name or truck..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Filter by dispatcher name..."
                className="pl-10"
                value={dispatcherFilter}
                onChange={(e) => setDispatcherFilter(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Fleet Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">On Duty Dispatchers</CardTitle>
                  <UserCheck className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {dispatchers.filter((d) => d.isActive && d.dispatcher.roles?.includes("dispatch")).length} /{" "}
                    {allDispatchers.filter((d: any) => d.roles?.includes("dispatch")).length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Assigned Trucks</CardTitle>
                  <Truck className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">{assignedTrucksCount}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unassigned Trucks</CardTitle>
                  <Truck className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">{unassignedTrucksCount}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg. Trucks per Dispatcher</CardTitle>
                  <Truck className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  {(() => {
                    // Only count trucks assigned to users with 'dispatch' role
                    const dispatchOnlyFleets = dispatchers.filter((d) => d.dispatcher.roles?.includes("dispatch"));
                    const onDutyDispatchers = dispatchOnlyFleets.filter((d) => d.isActive);
                    const allDispatchersCount = allDispatchers.filter((d: any) => d.roles?.includes("dispatch")).length;

                    // Calculate truck counts per dispatcher
                    const truckCounts = dispatchOnlyFleets.map((d) => {
                      const uniqueTrucks = new Set(d.drivers.map((driver: any) => driver.truck?.id).filter(Boolean));
                      return uniqueTrucks.size;
                    });

                    const totalTrucks = truckCounts.reduce((sum, count) => sum + count, 0);

                    // Calculate median
                    const sortedCounts = [...truckCounts].sort((a, b) => a - b);
                    const median =
                      sortedCounts.length > 0
                        ? sortedCounts.length % 2 === 0
                          ? (
                              (sortedCounts[sortedCounts.length / 2 - 1] + sortedCounts[sortedCounts.length / 2]) /
                              2
                            ).toFixed(1)
                          : sortedCounts[Math.floor(sortedCounts.length / 2)].toString()
                        : "0";

                    const avgOnDuty =
                      onDutyDispatchers.length > 0 ? (totalTrucks / onDutyDispatchers.length).toFixed(1) : "0";
                    const avgAll = allDispatchersCount > 0 ? (totalTrucks / allDispatchersCount).toFixed(1) : "0";

                    return (
                      <>
                        <div className="text-2xl font-bold text-primary">
                          {avgOnDuty} / {avgAll}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono">{`median: ${median}`}</div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Dispatcher Fleets */}
            {filterDispatchers(dispatchers.filter((d) => d.drivers.length > 0)).map((dispatcherFleet) => {
              const filteredDrivers = filterDrivers(dispatcherFleet.drivers);

              // Hide dispatcher if searching and no matching drivers
              if (searchTerm && filteredDrivers.length === 0) {
                return null;
              }

              const pageKey = `dispatcher-${dispatcherFleet.dispatcher.id}`;
              const {
                drivers: paginatedDrivers,
                totalPages,
                currentPage,
              } = getPaginatedDrivers(filteredDrivers, pageKey);

              return (
                <Droppable
                  key={dispatcherFleet.dispatcher.id}
                  droppableId={`dispatcher-${dispatcherFleet.dispatcher.id}`}
                >
                  {(provided, snapshot) => (
                    <Card
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`transition-colors ${snapshot.isDraggingOver ? "bg-primary/5 border-primary" : ""}`}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-5 w-5" />
                            {dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email}
                            {dispatcherFleet.dispatcher.ext && (
                              <span className="text-sm font-normal text-muted-foreground">
                                ext {dispatcherFleet.dispatcher.ext}
                              </span>
                            )}
                            <Badge variant="secondary">
                              {(() => {
                                const uniqueTrucks = new Set(
                                  filteredDrivers.map((driver: any) => driver.truck?.id).filter(Boolean),
                                );
                                return uniqueTrucks.size;
                              })()}{" "}
                              trucks
                            </Badge>
                            {snapshot.isDraggingOver && (
                              <Badge variant="outline" className="animate-pulse">
                                Drop here
                              </Badge>
                            )}
                          </div>

                          {/* Off Duty Toggle - Only visible to managers and admins */}
                          {(hasRole("manager") || hasRole("admin")) && (
                            <div className="flex items-center gap-2">
                              <Badge variant={dispatcherFleet.isActive ? "default" : "secondary"} className="mr-2">
                                {dispatcherFleet.isActive ? "Active" : "Off Duty"}
                              </Badge>
                              {dispatcherFleet.isActive ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleToggleDispatcher(
                                      dispatcherFleet.dispatcher.id,
                                      dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email,
                                      dispatcherFleet.drivers,
                                    )
                                  }
                                  disabled={loading || dispatcherFleet.drivers.length === 0}
                                >
                                  Set Off Duty
                                </Button>
                              ) : (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => setDispatcherActive(dispatcherFleet.dispatcher.id)}
                                  disabled={loading}
                                >
                                  Set Active
                                </Button>
                              )}
                            </div>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!dispatcherFleet.isActive ? (
                          /* Placeholder drivers for inactive dispatchers */
                          <div className="grid gap-2">
                            {paginatedDrivers.length > 0 ? (
                              (() => {
                                // Group drivers by truck number
                                const groupedByTruck = new Map<string, any[]>();
                                const noTruckDrivers: any[] = [];

                                paginatedDrivers.forEach((driver) => {
                                  if (driver.truck?.truck_number) {
                                    const truckNum = driver.truck.truck_number;
                                    if (!groupedByTruck.has(truckNum)) {
                                      groupedByTruck.set(truckNum, []);
                                    }
                                    groupedByTruck.get(truckNum)!.push(driver);
                                  } else {
                                    noTruckDrivers.push(driver);
                                  }
                                });

                                // Render team drivers and individual drivers
                                const renderedItems: JSX.Element[] = [];

                                groupedByTruck.forEach((drivers, truckNum) => {
                                  const isTeam = drivers.length > 1;
                                  const firstDriver = drivers[0];

                                  renderedItems.push(
                                    <div
                                      key={`truck-${truckNum}`}
                                      className="flex items-center justify-between p-3 border rounded-lg opacity-60 bg-muted/30"
                                    >
                                      <div className="flex items-center gap-3">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                          <div className="font-medium flex items-center gap-2 flex-wrap">
                                            {isTeam ? "TEAM" : firstDriver.name}
                                            {isTeam && (
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="inline-flex">
                                                    <Info className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto">
                                                  <div className="space-y-1">
                                                    {drivers.map((driver, idx) => (
                                                      <div key={driver.id}>
                                                        {idx > 0 && <div className="border-t pt-1 mt-1" />}
                                                        <p className="font-semibold text-sm">
                                                          Driver {idx + 1}: {driver.name}
                                                        </p>
                                                        {driver.phone && <p className="text-xs">📞 {driver.phone}</p>}
                                                        {driver.email && <p className="text-xs">✉️ {driver.email}</p>}
                                                      </div>
                                                    ))}
                                                    <div className="border-t pt-1 mt-1">
                                                      <p className="text-xs">🚚 Truck: {truckNum}</p>
                                                    </div>
                                                  </div>
                                                </PopoverContent>
                                              </Popover>
                                            )}
                                            <span className="text-muted-foreground">•</span>
                                            <span className="text-sm font-normal whitespace-nowrap">
                                              Truck {truckNum}
                                            </span>
                                          </div>
                                          <div className="text-xs text-muted-foreground">Temporarily reassigned</div>
                                        </div>
                                      </div>
                                    </div>,
                                  );
                                });

                                // Add drivers without trucks
                                noTruckDrivers.forEach((driver) => {
                                  renderedItems.push(
                                    <div
                                      key={driver.id}
                                      className="flex items-center justify-between p-3 border rounded-lg opacity-60 bg-muted/30"
                                    >
                                      <div className="flex items-center gap-3">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                          <div className="font-medium">{driver.name}</div>
                                          <div className="text-xs text-muted-foreground">Temporarily reassigned</div>
                                        </div>
                                      </div>
                                    </div>,
                                  );
                                });

                                return renderedItems;
                              })()
                            ) : (
                              <p className="text-sm text-muted-foreground p-3">No drivers were assigned</p>
                            )}
                          </div>
                        ) : (
                          /* Active dispatcher drivers with full functionality */
                          <div className="grid gap-2">
                            {(() => {
                              // Group drivers by truck number
                              const groupedByTruck = new Map<string, any[]>();
                              const noTruckDrivers: any[] = [];

                              paginatedDrivers.forEach((driver) => {
                                if (driver.truck?.truck_number) {
                                  const truckNum = driver.truck.truck_number;
                                  if (!groupedByTruck.has(truckNum)) {
                                    groupedByTruck.set(truckNum, []);
                                  }
                                  groupedByTruck.get(truckNum)!.push(driver);
                                } else {
                                  noTruckDrivers.push(driver);
                                }
                              });

                              // Render team drivers and individual drivers
                              const renderedItems: JSX.Element[] = [];
                              let currentIndex = 0;

                              groupedByTruck.forEach((drivers, truckNum) => {
                                const isTeam = drivers.length > 1;
                                const firstDriver = drivers[0];
                                const draggableId = isTeam ? `team-${truckNum}` : firstDriver.id;

                                renderedItems.push(
                                  <Draggable key={draggableId} draggableId={draggableId} index={currentIndex++}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`flex items-center justify-between p-3 border rounded-lg transition-transform hover:shadow-md ${
                                          snapshot.isDragging ? "shadow-lg scale-105 bg-background rotate-2" : ""
                                        }`}
                                      >
                                        <div className="flex items-center gap-3">
                                          <div
                                            {...provided.dragHandleProps}
                                            className="cursor-grab active:cursor-grabbing"
                                          >
                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                          </div>
                                          <Users className="h-4 w-4" />
                                          <div>
                                            <div className="font-medium flex items-center gap-2">
                                              {isTeam ? "TEAM" : firstDriver.name}
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="inline-flex">
                                                    <Info className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto">
                                                  <div className="space-y-1">
                                                    {isTeam ? (
                                                      <>
                                                        {drivers.map((driver, idx) => (
                                                          <div key={driver.id}>
                                                            {idx > 0 && <div className="border-t pt-1 mt-1" />}
                                                            <p className="font-semibold text-sm">
                                                              Driver {idx + 1}: {driver.name}
                                                            </p>
                                                            {driver.phone && (
                                                              <p className="text-xs">📞 {driver.phone}</p>
                                                            )}
                                                            {driver.email && (
                                                              <p className="text-xs">✉️ {driver.email}</p>
                                                            )}
                                                          </div>
                                                        ))}
                                                      </>
                                                    ) : (
                                                      <>
                                                        <p className="font-semibold">{firstDriver.name}</p>
                                                        {firstDriver.phone && (
                                                          <p className="text-sm">📞 {firstDriver.phone}</p>
                                                        )}
                                                        {firstDriver.email && (
                                                          <p className="text-sm">✉️ {firstDriver.email}</p>
                                                        )}
                                                      </>
                                                    )}
                                                  </div>
                                                </PopoverContent>
                                              </Popover>
                                            </div>
                                            <div className="text-sm text-muted-foreground flex items-center gap-2 flex-nowrap">
                                              <span className="whitespace-nowrap">Truck {truckNum}</span>
                                            </div>
                                          </div>
                                        </div>
                                        {(hasRole("admin") || hasRole("manager") || hasRole("supervisor")) && (
                                          <div className="flex gap-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                if (isTeam) {
                                                  // For teams, switch all drivers together
                                                  setDriverToSwitch({
                                                    driverIds: drivers.map((d) => d.id),
                                                    currentDispatcherId: dispatcherFleet.dispatcher.id,
                                                  });
                                                } else {
                                                  setDriverToSwitch({
                                                    driverIds: [firstDriver.id],
                                                    currentDispatcherId: dispatcherFleet.dispatcher.id,
                                                  });
                                                }
                                              }}
                                            >
                                              <ArrowRightLeft className="h-4 w-4 mr-1" />
                                              Switch
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                if (isTeam) {
                                                  // Remove all drivers in the team
                                                  drivers.forEach((driver) => handleRemoveDriver(driver.id));
                                                } else {
                                                  handleRemoveDriver(firstDriver.id);
                                                }
                                              }}
                                            >
                                              <Minus className="h-4 w-4 mr-1" />
                                              Remove
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </Draggable>,
                                );
                              });

                              // Add drivers without trucks
                              noTruckDrivers.forEach((driver) => {
                                renderedItems.push(
                                  <Draggable key={driver.id} draggableId={driver.id} index={currentIndex++}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`flex items-center justify-between p-3 border rounded-lg transition-transform hover:shadow-md ${
                                          snapshot.isDragging ? "shadow-lg scale-105 bg-background rotate-2" : ""
                                        }`}
                                      >
                                        <div className="flex items-center gap-3">
                                          <div
                                            {...provided.dragHandleProps}
                                            className="cursor-grab active:cursor-grabbing"
                                          >
                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                          </div>
                                          <Users className="h-4 w-4" />
                                          <div>
                                            <div className="font-medium flex items-center gap-2">
                                              {driver.name}
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="inline-flex">
                                                    <Info className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto">
                                                  <div className="space-y-1">
                                                    <p className="font-semibold">{driver.name}</p>
                                                    {driver.phone && <p className="text-sm">📞 {driver.phone}</p>}
                                                    {driver.email && <p className="text-sm">✉️ {driver.email}</p>}
                                                  </div>
                                                </PopoverContent>
                                              </Popover>
                                            </div>
                                            <div className="text-sm text-muted-foreground">No truck assigned</div>
                                          </div>
                                        </div>
                                        {(hasRole("admin") || hasRole("manager") || hasRole("supervisor")) && (
                                          <div className="flex gap-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                setDriverToSwitch({
                                                  driverIds: [driver.id],
                                                  currentDispatcherId: dispatcherFleet.dispatcher.id,
                                                })
                                              }
                                            >
                                              <ArrowRightLeft className="h-4 w-4 mr-1" />
                                              Switch
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleRemoveDriver(driver.id)}
                                            >
                                              <Minus className="h-4 w-4 mr-1" />
                                              Remove
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </Draggable>,
                                );
                              });

                              return renderedItems;
                            })()}
                            {provided.placeholder}
                          </div>
                        )}
                        {totalPages > 1 && (
                          <div className="mt-4 pt-4 border-t">
                            <Pagination>
                              <PaginationContent>
                                <PaginationItem>
                                  <PaginationPrevious
                                    onClick={() => setPage(pageKey, Math.max(1, currentPage - 1))}
                                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                  />
                                </PaginationItem>

                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                  <PaginationItem key={page}>
                                    <PaginationLink
                                      onClick={() => setPage(pageKey, page)}
                                      isActive={currentPage === page}
                                      className="cursor-pointer"
                                    >
                                      {page}
                                    </PaginationLink>
                                  </PaginationItem>
                                ))}

                                <PaginationItem>
                                  <PaginationNext
                                    onClick={() => setPage(pageKey, Math.min(totalPages, currentPage + 1))}
                                    className={
                                      currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                                    }
                                  />
                                </PaginationItem>
                              </PaginationContent>
                            </Pagination>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </Droppable>
              );
            })}

            {/* Dispatchers with no drivers */}
            {filterDispatchers(dispatchers.filter((d) => d.drivers.length === 0)).length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Available Dispatchers
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filterDispatchers(dispatchers.filter((d) => d.drivers.length === 0)).map((dispatcherFleet) => (
                    <Droppable
                      key={dispatcherFleet.dispatcher.id}
                      droppableId={`dispatcher-${dispatcherFleet.dispatcher.id}`}
                    >
                      {(provided, snapshot) => (
                        <Card
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`transition-colors ${snapshot.isDraggingOver ? "bg-primary/5 border-primary" : ""}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <UserCheck className="h-4 w-4" />
                                <div>
                                  <div className="font-medium">
                                    {dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email}
                                    {dispatcherFleet.dispatcher.ext && (
                                      <span className="text-sm font-normal text-muted-foreground ml-2">
                                        ext {dispatcherFleet.dispatcher.ext}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {snapshot.isDraggingOver ? "Drop driver here" : "No drivers assigned"}
                                  </div>
                                </div>
                              </div>
                              <Badge variant="outline">Available</Badge>
                            </div>
                            {provided.placeholder}
                          </CardContent>
                        </Card>
                      )}
                    </Droppable>
                  ))}
                </div>
              </div>
            )}

            {/* Unassigned Drivers */}
            {availableDrivers.length > 0 &&
              (() => {
                const filteredUnassigned = filterDrivers(availableDrivers);
                const pageKey = "unassigned";
                const {
                  drivers: paginatedDrivers,
                  totalPages,
                  currentPage,
                } = getPaginatedDrivers(filteredUnassigned, pageKey);

                return (
                  <Droppable droppableId="unassigned">
                    {(provided, snapshot) => (
                      <Card
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`transition-colors ${snapshot.isDraggingOver ? "bg-warning/5 border-warning" : ""}`}
                      >
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Unassigned Drivers
                            <Badge variant="outline">{filteredUnassigned.length} drivers</Badge>
                            {snapshot.isDraggingOver && (
                              <Badge variant="outline" className="animate-pulse">
                                Drop to unassign
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid gap-2">
                            {paginatedDrivers.map((driver, index) => (
                              <Draggable key={driver.id} draggableId={driver.id} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={`flex items-center justify-between p-3 border rounded-lg transition-transform hover:shadow-md ${
                                      snapshot.isDragging ? "shadow-lg scale-105 bg-background rotate-2" : ""
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      <Users className="h-4 w-4" />
                                      <div>
                                        <div className="font-medium flex items-center gap-2">
                                          {driver.name}
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="inline-flex">
                                                <Info className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto">
                                              <div className="space-y-1">
                                                <p className="font-semibold">{driver.name}</p>
                                                {driver.phone && <p className="text-sm">📞 {driver.phone}</p>}
                                                {driver.email && <p className="text-sm">✉️ {driver.email}</p>}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                          {driver.truck ? `Truck ${driver.truck.truck_number}` : "No truck assigned"}
                                        </div>
                                      </div>
                                    </div>
                                    <Badge variant="secondary">Available</Badge>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                          {totalPages > 1 && (
                            <div className="mt-4 pt-4 border-t">
                              <Pagination>
                                <PaginationContent>
                                  <PaginationItem>
                                    <PaginationPrevious
                                      onClick={() => setPage(pageKey, Math.max(1, currentPage - 1))}
                                      className={
                                        currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                                      }
                                    />
                                  </PaginationItem>

                                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                    <PaginationItem key={page}>
                                      <PaginationLink
                                        onClick={() => setPage(pageKey, page)}
                                        isActive={currentPage === page}
                                        className="cursor-pointer"
                                      >
                                        {page}
                                      </PaginationLink>
                                    </PaginationItem>
                                  ))}

                                  <PaginationItem>
                                    <PaginationNext
                                      onClick={() => setPage(pageKey, Math.min(totalPages, currentPage + 1))}
                                      className={
                                        currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                                      }
                                    />
                                  </PaginationItem>
                                </PaginationContent>
                              </Pagination>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </Droppable>
                );
              })()}
          </div>
        </div>
      </div>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={driverToRemove !== null} onOpenChange={(open) => !open && setDriverToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Driver from Dispatcher</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this driver from their dispatcher? The driver will be moved to the
              unassigned list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveDriver}>Remove Driver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Switch Dispatcher Dialog */}
      <Dialog open={driverToSwitch !== null} onOpenChange={(open) => !open && setDriverToSwitch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch Dispatcher</DialogTitle>
            <DialogDescription>Select a new dispatcher for this driver</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Combobox
              options={allDispatchers
                .filter((d) => d.id !== driverToSwitch?.currentDispatcherId)
                .map((dispatcher) => ({
                  value: dispatcher.id,
                  label: `${dispatcher.full_name || dispatcher.email}${dispatcher.ext ? ` (ext ${dispatcher.ext})` : ""}`,
                }))}
              value={selectedDispatcher}
              onValueChange={setSelectedDispatcher}
              placeholder="Search dispatchers..."
              emptyText="No dispatcher found."
            />
            <Button onClick={handleSwitchDispatcher} className="w-full" disabled={!selectedDispatcher}>
              Switch Dispatcher
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Off Duty Confirmation Dialog */}
      <AlertDialog
        open={dispatcherToToggle !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDispatcherToToggle(null);
            setDriverCoverAssignments({});
          }
        }}
      >
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Set Dispatcher as Off Duty?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-4">
                <p>Assign a cover dispatcher for each driver currently assigned to {dispatcherToToggle?.name}.</p>
                <div className="space-y-3">
                  {dispatcherToToggle?.drivers.map((driver) => (
                    <div key={driver.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                      <div className="flex items-center gap-2 flex-1">
                        <Users className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{driver.name}</div>
                          {driver.truck && (
                            <div className="text-xs text-muted-foreground">Truck {driver.truck.truck_number}</div>
                          )}
                        </div>
                      </div>
                      <Combobox
                        value={driverCoverAssignments[driver.id] || ""}
                        onValueChange={(value) =>
                          setDriverCoverAssignments((prev) => ({
                            ...prev,
                            [driver.id]: value,
                          }))
                        }
                        options={allDispatchers
                          .filter((d) => d.id !== dispatcherToToggle?.id)
                          .map((dispatcher) => ({
                            value: dispatcher.id,
                            label: `${dispatcher.full_name || dispatcher.email}${dispatcher.ext ? ` (ext ${dispatcher.ext})` : ""}`,
                          }))}
                        placeholder="Select cover..."
                        emptyText="No dispatchers found"
                        searchPlaceholder="Search dispatchers..."
                        className="w-[250px]"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  When you set this dispatcher back to active, all their original drivers will be automatically returned
                  to them.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleOffDuty}
              disabled={Object.values(driverCoverAssignments).some((v) => !v)}
            >
              Set Off Duty
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AfterhoursScheduleDialog open={isAfterhoursScheduleOpen} onOpenChange={setIsAfterhoursScheduleOpen} />
    </DragDropContext>
  );
};

export default Fleets;
