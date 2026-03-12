import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Plus, Minus, Users, UserCheck, GripVertical, Search, Info, ArrowRightLeft, CalendarDays, Award, Crown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { Label } from "@/components/ui/label";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useAuthContext } from "@/contexts/AuthContext";
import { AfterhoursScheduleDialog } from "@/components/AfterhoursScheduleDialog";
import { DispatcherBonusesDialog } from "@/components/DispatcherBonusesDialog";
import { SupervisorsSection } from "@/components/SupervisorsSection";
import AfterhoursFleetTab from "@/components/AfterhoursFleetTab";
import { supabase } from "@/integrations/supabase/client";

// Generate month options for the last 12 months
const generateMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    });
    options.push({
      value,
      label
    });
  }
  return options;
};
const Fleets = () => {
  const {
    hasRole
  } = useAuthContext();
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
    setDispatcherActive
  } = useFleetManagement();
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedDispatcher, setSelectedDispatcher] = useState("");
  const [isAssignDriverOpen, setIsAssignDriverOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dispatcherFilter, setDispatcherFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("all");
  const [currentPages, setCurrentPages] = useState<Record<string, number>>({});
  const [driverToRemove, setDriverToRemove] = useState<string | null>(null);
  const [driverToSwitch, setDriverToSwitch] = useState<{
    driverIds: string[];
    currentDispatcherId: string;
  } | null>(null);
  const [dispatcherToToggle, setDispatcherToToggle] = useState<{
    id: string;
    name: string;
    drivers: any[];
  } | null>(null);
  const [driverCoverAssignments, setDriverCoverAssignments] = useState<Record<string, string>>({});
  const [isAfterhoursScheduleOpen, setIsAfterhoursScheduleOpen] = useState(false);
  const [dayOffToggle, setDayOffToggle] = useState(false);
  const [isBonusesDialogOpen, setIsBonusesDialogOpen] = useState(false);
  const [bonusMonth, setBonusMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const monthOptions = generateMonthOptions();
  const itemsPerPage = 12;

  // Filter drivers by search term
  const filterDrivers = (drivers: any[]) => {
    if (!searchTerm) return drivers;
    const searchLower = searchTerm.toLowerCase();
    return drivers.filter(driver => {
      const nameMatch = driver?.name?.toLowerCase().includes(searchLower);
      const truckMatch = driver?.truck?.truck_number?.toString().toLowerCase().includes(searchLower);
      return nameMatch || truckMatch;
    });
  };

  // Filter dispatchers by name
  const filterDispatchers = (dispatcherFleets: any[]) => {
    let filtered = dispatcherFleets;
    if (officeFilter !== "all") {
      filtered = filtered.filter(fleet => {
        const office = fleet.dispatcher.office || "";
        return office.toLowerCase() === officeFilter.toLowerCase();
      });
    }
    if (!dispatcherFilter) return filtered;
    return filtered.filter(fleet => {
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
      currentPage
    };
  };
  const setPage = (pageKey: string, page: number) => {
    setCurrentPages(prev => ({
      ...prev,
      [pageKey]: page
    }));
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
    const {
      destination,
      source,
      draggableId
    } = result;

    // If no destination or dropped in same place, do nothing
    if (!destination || destination.droppableId === source.droppableId && destination.index === source.index) {
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
    drivers.forEach(driver => {
      initialAssignments[driver.id] = "";
    });
    setDriverCoverAssignments(initialAssignments);

    // Show confirmation dialog for setting OFF DUTY
    setDispatcherToToggle({
      id: dispatcherId,
      name: dispatcherName,
      drivers: drivers
    });
  };
  const confirmToggleOffDuty = async () => {
    if (!dispatcherToToggle) return;

    // Validate all drivers have cover dispatchers assigned
    const hasUnassigned = Object.values(driverCoverAssignments).some(v => !v);
    if (hasUnassigned) {
      return; // Don't proceed if not all drivers have cover
    }
    await setDispatcherOffDuty(dispatcherToToggle.id, driverCoverAssignments, dayOffToggle);
    setDispatcherToToggle(null);
    setDriverCoverAssignments({});
    setDayOffToggle(false);
  };
  if (loading) {
    return <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b bg-background px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 sm:h-6 sm:w-6" />
              <h1 className="text-lg sm:text-2xl font-bold">Dispatcher Fleet Management</h1>
            </div>
            <Skeleton className="h-8 sm:h-10 w-[160px] sm:w-[240px]" />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:max-w-2xl">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Fleet Summary Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              {[1, 2, 3, 4].map(i => <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
                    <Skeleton className="h-3 sm:h-4 w-16 sm:w-32" />
                    <Skeleton className="h-3 w-3 sm:h-4 sm:w-4" />
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    <Skeleton className="h-6 sm:h-8 w-10 sm:w-12" />
                  </CardContent>
                </Card>)}
            </div>

            {/* Dispatcher Fleet Skeletons */}
            {[1, 2, 3].map(i => <Card key={i}>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 sm:h-5 sm:w-5" />
                      <Skeleton className="h-5 sm:h-6 w-32 sm:w-48" />
                      <Skeleton className="h-4 sm:h-5 w-14 sm:w-20" />
                    </div>
                    <Skeleton className="h-7 sm:h-9 w-20 sm:w-32" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="grid gap-2">
                    {[1, 2, 3, 4, 5].map(j => <div key={j} className="flex items-center justify-between p-2 sm:p-3 border rounded-lg">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <Skeleton className="h-3 w-3 sm:h-4 sm:w-4" />
                          <Skeleton className="h-3 w-3 sm:h-4 sm:w-4" />
                          <div className="space-y-1 sm:space-y-2">
                            <Skeleton className="h-4 w-24 sm:w-32" />
                            <Skeleton className="h-3 w-16 sm:w-24" />
                          </div>
                        </div>
                        <div className="flex gap-1 sm:gap-2">
                          <Skeleton className="h-7 w-8 sm:h-8 sm:w-20" />
                          <Skeleton className="h-7 w-8 sm:h-8 sm:w-20" />
                        </div>
                      </div>)}
                  </div>
                </CardContent>
              </Card>)}
          </div>
        </div>
      </div>;
  }
  return <DragDropContext onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b bg-background px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 sm:h-6 sm:w-6" />
              <h1 className="text-lg sm:text-2xl font-bold">Dispatcher Fleet Management</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="sm:size-default" onClick={() => setIsAfterhoursScheduleOpen(true)}>
                <CalendarDays className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Weekend Schedule</span>
              </Button>
              <Dialog open={isAssignDriverOpen} onOpenChange={setIsAssignDriverOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="sm:size-default">
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Assign Driver to Dispatcher</span>
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
                      <Combobox options={availableDrivers.map(driver => ({
                      value: driver.id,
                      label: `${driver.name}${driver.truck ? ` - Truck ${driver.truck.truck_number}` : ""}`
                    }))} value={selectedDriver} onValueChange={setSelectedDriver} placeholder="Search drivers..." emptyText="No driver found." searchPlaceholder="Search by name or truck..." />
                    </div>
                    <div>
                      <Label>Select Dispatcher</Label>
                      <Combobox options={allDispatchers.map(dispatcher => ({
                      value: dispatcher.id,
                      label: `${dispatcher.full_name || dispatcher.email}${dispatcher.ext ? ` (ext ${dispatcher.ext})` : ""}`
                    }))} value={selectedDispatcher} onValueChange={setSelectedDispatcher} placeholder="Search dispatchers..." emptyText="No dispatcher found." searchPlaceholder="Search by name..." />
                    </div>
                    <Button onClick={handleAssignDriver} className="w-full" disabled={!selectedDriver || !selectedDispatcher}>
                      Assign Driver
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-1 sm:max-w-3xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="Search drivers..." className="pl-10 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="Filter dispatchers..." className="pl-10 text-sm" value={dispatcherFilter} onChange={e => setDispatcherFilter(e.target.value)} />
              </div>
              <Select value={officeFilter} onValueChange={setOfficeFilter}>
                <SelectTrigger className="w-full sm:w-[180px] text-sm">
                  <SelectValue placeholder="All Offices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Offices</SelectItem>
                  <SelectItem value="BEOGRAD">Beograd</SelectItem>
                  <SelectItem value="KRAGUJEVAC">Kragujevac</SelectItem>
                  <SelectItem value="Čačak">Čačak</SelectItem>
                  <SelectItem value="Recovery">Recovery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Fleet Summary */}
            {(() => {
              const officeFilterFn = (office: string | null | undefined) =>
                officeFilter === "all" || (office || "").toLowerCase() === officeFilter.toLowerCase();

              const filteredDispatchers = dispatchers.filter(d => officeFilterFn(d.dispatcher.office));
              const filteredAllDispatchers = allDispatchers.filter((d: any) => officeFilterFn(d.office));

              // Assigned trucks = unique trucks from filtered dispatchers' drivers
              const filteredAssignedTrucks = new Set<string>();
              filteredDispatchers.forEach(d => {
                d.drivers.forEach((driver: any) => {
                  if (driver.truck?.id) filteredAssignedTrucks.add(driver.truck.id);
                });
              });

              const dispatchOnly = filteredDispatchers.filter(d => d.dispatcher.roles?.includes("dispatch"));
              const onDutyDispatchers = dispatchOnly.filter(d => d.isActive);
              const allDispCount = filteredAllDispatchers.filter((d: any) => d.roles?.includes("dispatch")).length;

              const truckCounts = dispatchOnly.map(d => {
                const uniqueTrucks = new Set(d.drivers.map((driver: any) => driver.truck?.id).filter(Boolean));
                return uniqueTrucks.size;
              });
              const totalTrucks = truckCounts.reduce((sum, count) => sum + count, 0);

              const sortedCounts = [...truckCounts].sort((a, b) => a - b);
              const median = sortedCounts.length > 0 ? sortedCounts.length % 2 === 0 ? ((sortedCounts[sortedCounts.length / 2 - 1] + sortedCounts[sortedCounts.length / 2]) / 2).toFixed(1) : sortedCounts[Math.floor(sortedCounts.length / 2)].toString() : "0";
              const avgOnDuty = onDutyDispatchers.length > 0 ? (totalTrucks / onDutyDispatchers.length).toFixed(1) : "0";
              const avgAll = allDispCount > 0 ? (totalTrucks / allDispCount).toFixed(1) : "0";

              return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium">On Duty</CardTitle>
                  <UserCheck className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-primary">
                    {onDutyDispatchers.length} / {allDispCount}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium">Assigned</CardTitle>
                  <Truck className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-success">{officeFilter === "all" ? assignedTrucksCount : filteredAssignedTrucks.size}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium">Unassigned</CardTitle>
                  <Truck className="h-3 w-3 sm:h-4 sm:w-4 text-warning" />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-warning">{officeFilter === "all" ? unassignedTrucksCount : "—"}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium">Avg. per Disp.</CardTitle>
                  <Truck className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                        <div className="text-lg sm:text-2xl font-bold text-primary">
                          {avgOnDuty} / {avgAll}
                        </div>
                        <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 font-mono">{`median: ${median}`}</div>
                </CardContent>
              </Card>
            </div>
              );
            })()}

            <Tabs defaultValue="dispatchers" className="w-full">
              <TabsList className="grid w-full max-w-lg grid-cols-3">
                <TabsTrigger value="dispatchers" className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Dispatchers
                </TabsTrigger>
                <TabsTrigger value="supervisors" className="flex items-center gap-2">
                  <Crown className="h-4 w-4" />
                  Supervisors
                </TabsTrigger>
                <TabsTrigger value="afterhours" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Afterhours
                </TabsTrigger>
              </TabsList>

              <TabsContent value="dispatchers" className="mt-4 space-y-4">
                {/* Dispatcher Fleets */}
            {filterDispatchers(dispatchers.filter(d => d.drivers.length > 0)).sort((a, b) => {
              // Inactive dispatchers first
              if (!a.isActive && b.isActive) return -1;
              if (a.isActive && !b.isActive) return 1;
              return 0;
            }).map(dispatcherFleet => {
            const filteredDrivers = filterDrivers(dispatcherFleet.drivers);

            // Hide dispatcher if searching and no matching drivers
            if (searchTerm && filteredDrivers.length === 0) {
              return null;
            }
            const pageKey = `dispatcher-${dispatcherFleet.dispatcher.id}`;
            const {
              drivers: paginatedDrivers,
              totalPages,
              currentPage
            } = getPaginatedDrivers(filteredDrivers, pageKey);
            return <Droppable key={dispatcherFleet.dispatcher.id} droppableId={`dispatcher-${dispatcherFleet.dispatcher.id}`}>
                  {(provided, snapshot) => <Card ref={provided.innerRef} {...provided.droppableProps} className={`transition-colors ${snapshot.isDraggingOver ? "bg-primary/5 border-primary" : ""}`}>
                      <CardHeader className="p-3 sm:p-6">
                        <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <UserCheck className="h-4 w-4 sm:h-5 sm:w-5" />
                            <span className="text-sm sm:text-base">{dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email}</span>
                            {dispatcherFleet.dispatcher.ext && <span className="text-xs sm:text-sm font-normal text-muted-foreground">
                                ext {dispatcherFleet.dispatcher.ext}
                              </span>}
                            <Badge variant="secondary" className="text-xs">
                              {(() => {
                          const uniqueTrucks = new Set(filteredDrivers.map((driver: any) => driver.truck?.id).filter(Boolean));
                          return uniqueTrucks.size;
                        })()}{" "}
                              trucks
                            </Badge>
                            {snapshot.isDraggingOver && <Badge variant="outline" className="animate-pulse text-xs">
                                Drop here
                              </Badge>}
                          </div>

                          {/* Off Duty Badge - visible to managers, admins, and safety */}
                          {(hasRole("manager") || hasRole("admin") || hasRole("safety")) && <div className="flex items-center gap-2">
                              <Badge variant={dispatcherFleet.isActive ? "default" : "secondary"} className="text-xs">
                                {dispatcherFleet.isActive ? "Active" : "Off Duty"}
                              </Badge>
                              {/* Toggle buttons - Only visible to managers and admins */}
                              {(hasRole("manager") || hasRole("admin")) && (dispatcherFleet.isActive ? <Button variant="outline" size="sm" className="text-xs h-7 sm:h-9" onClick={() => handleToggleDispatcher(dispatcherFleet.dispatcher.id, dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email, dispatcherFleet.drivers)} disabled={loading || dispatcherFleet.drivers.length === 0}>
                                  <span className="hidden sm:inline">Set Off Duty</span>
                                  <span className="sm:hidden">Off Duty</span>
                                </Button> : <Button variant="default" size="sm" className="text-xs h-7 sm:h-9" onClick={() => setDispatcherActive(dispatcherFleet.dispatcher.id)} disabled={loading}>
                                  <span className="hidden sm:inline">Set Active</span>
                                  <span className="sm:hidden">Active</span>
                                </Button>)}
                            </div>}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                        {!dispatcherFleet.isActive ? (/* Placeholder drivers for inactive dispatchers */
                  <div className="grid gap-2">
                            {paginatedDrivers.length > 0 ? (() => {
                      // Helper to find which active dispatcher a driver is currently assigned to
                      const findCurrentDispatcher = (driverId: string) => {
                        for (const fleet of dispatchers) {
                          if (fleet.isActive && fleet.drivers.some(d => d.id === driverId)) {
                            return fleet.dispatcher.full_name || fleet.dispatcher.email;
                          }
                        }
                        return null;
                      };

                      // Group drivers by truck number
                      const groupedByTruck = new Map<string, any[]>();
                      const noTruckDrivers: any[] = [];
                      paginatedDrivers.forEach(driver => {
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
                        const currentDispatcherName = findCurrentDispatcher(firstDriver.id);
                        renderedItems.push(<div key={`truck-${truckNum}`} className="flex items-center justify-between p-2 sm:p-3 border rounded-lg opacity-60 bg-muted/30">
                                      <div className="flex items-center gap-2 sm:gap-3">
                                        <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                        <div>
                                          <div className="text-sm sm:text-base font-medium flex items-center gap-2 flex-wrap">
                                            {isTeam ? "TEAM" : firstDriver.name}
                                            {isTeam && <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="inline-flex">
                                                    <Info className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto">
                                                  <div className="space-y-1">
                                                    {drivers.map((driver, idx) => <div key={driver.id}>
                                                        {idx > 0 && <div className="border-t pt-1 mt-1" />}
                                                        <p className="font-semibold text-sm">
                                                          Driver {idx + 1}: {driver.name}
                                                        </p>
                                                        {driver.phone && <p className="text-xs">📞 {driver.phone}</p>}
                                                        {driver.email && <p className="text-xs">✉️ {driver.email}</p>}
                                                      </div>)}
                                                    <div className="border-t pt-1 mt-1">
                                                      <p className="text-xs">🚚 Truck: {truckNum}</p>
                                                    </div>
                                                  </div>
                                                </PopoverContent>
                                              </Popover>}
                                            <span className="text-muted-foreground hidden sm:inline">•</span>
                                            <span className="text-xs sm:text-sm font-normal whitespace-nowrap">
                                              Truck {truckNum}
                                            </span>
                                          </div>
                                          <div className="text-[10px] sm:text-xs text-muted-foreground">
                                            Temporarily reassigned to {currentDispatcherName || 'another dispatcher'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>);
                      });

                      // Add drivers without trucks
                      noTruckDrivers.forEach(driver => {
                        const currentDispatcherName = findCurrentDispatcher(driver.id);
                        renderedItems.push(<div key={driver.id} className="flex items-center justify-between p-2 sm:p-3 border rounded-lg opacity-60 bg-muted/30">
                                      <div className="flex items-center gap-2 sm:gap-3">
                                        <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                        <div>
                                          <div className="text-sm sm:text-base font-medium">{driver.name}</div>
                                          <div className="text-[10px] sm:text-xs text-muted-foreground">
                                            Temporarily reassigned to {currentDispatcherName || 'another dispatcher'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>);
                      });
                      return renderedItems;
                    })() : <p className="text-sm text-muted-foreground p-3">No drivers were assigned</p>}
                          </div>) : (/* Active dispatcher drivers with full functionality */
                  <div className="grid gap-2">
                            {(() => {
                      // Group drivers by truck number
                      const groupedByTruck = new Map<string, any[]>();
                      const noTruckDrivers: any[] = [];
                      paginatedDrivers.forEach(driver => {
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
                        renderedItems.push(<Draggable key={draggableId} draggableId={draggableId} index={currentIndex++}>
                                    {(provided, snapshot) => <div ref={provided.innerRef} {...provided.draggableProps} className={`flex items-center justify-between p-2 sm:p-3 border rounded-lg transition-transform hover:shadow-md ${snapshot.isDragging ? "shadow-lg scale-105 bg-background rotate-2" : ""}`}>
                                        <div className="flex items-center gap-2 sm:gap-3">
                                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                            <GripVertical className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                          </div>
                                          <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                                          <div>
                                            <div className="text-sm sm:text-base font-medium flex items-center gap-2">
                                              {isTeam ? "TEAM" : firstDriver.name}
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="inline-flex">
                                                    <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto">
                                                  <div className="space-y-1">
                                                    {isTeam ? <>
                                                        {drivers.map((driver, idx) => <div key={driver.id}>
                                                            {idx > 0 && <div className="border-t pt-1 mt-1" />}
                                                            <p className="font-semibold text-sm">
                                                              Driver {idx + 1}: {driver.name}
                                                            </p>
                                                            {driver.phone && <p className="text-xs">📞 {driver.phone}</p>}
                                                            {driver.email && <p className="text-xs">✉️ {driver.email}</p>}
                                                          </div>)}
                                                      </> : <>
                                                        <p className="font-semibold">{firstDriver.name}</p>
                                                        {firstDriver.phone && <p className="text-sm">📞 {firstDriver.phone}</p>}
                                                        {firstDriver.email && <p className="text-sm">✉️ {firstDriver.email}</p>}
                                                      </>}
                                                  </div>
                                                </PopoverContent>
                                              </Popover>
                                            </div>
                                            <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 flex-nowrap">
                                              <span className="whitespace-nowrap">Truck {truckNum}</span>
                                            </div>
                                          </div>
                                        </div>
                                        {(hasRole("admin") || hasRole("manager") || hasRole("supervisor")) && <div className="flex gap-1 sm:gap-2">
                                            <Button variant="outline" size="sm" className="h-7 sm:h-9 px-2 sm:px-3" onClick={() => {
                                if (isTeam) {
                                  // For teams, switch all drivers together
                                  setDriverToSwitch({
                                    driverIds: drivers.map(d => d.id),
                                    currentDispatcherId: dispatcherFleet.dispatcher.id
                                  });
                                } else {
                                  setDriverToSwitch({
                                    driverIds: [firstDriver.id],
                                    currentDispatcherId: dispatcherFleet.dispatcher.id
                                  });
                                }
                              }}>
                                              <ArrowRightLeft className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                              <span className="hidden sm:inline">Switch</span>
                                            </Button>
                                            <Button variant="outline" size="sm" className="h-7 sm:h-9 px-2 sm:px-3" onClick={() => {
                                if (isTeam) {
                                  // Remove all drivers in the team
                                  drivers.forEach(driver => handleRemoveDriver(driver.id));
                                } else {
                                  handleRemoveDriver(firstDriver.id);
                                }
                              }}>
                                              <Minus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                              <span className="hidden sm:inline">Remove</span>
                                            </Button>
                                          </div>}
                                      </div>}
                                  </Draggable>);
                      });

                      // Add drivers without trucks
                      noTruckDrivers.forEach(driver => {
                        renderedItems.push(<Draggable key={driver.id} draggableId={driver.id} index={currentIndex++}>
                                    {(provided, snapshot) => <div ref={provided.innerRef} {...provided.draggableProps} className={`flex items-center justify-between p-2 sm:p-3 border rounded-lg transition-transform hover:shadow-md ${snapshot.isDragging ? "shadow-lg scale-105 bg-background rotate-2" : ""}`}>
                                        <div className="flex items-center gap-2 sm:gap-3">
                                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                            <GripVertical className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                          </div>
                                          <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                                          <div>
                                            <div className="text-sm sm:text-base font-medium flex items-center gap-2">
                                              {driver.name}
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="inline-flex">
                                                    <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
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
                                            <div className="text-xs sm:text-sm text-muted-foreground">No truck assigned</div>
                                          </div>
                                        </div>
                                        {(hasRole("admin") || hasRole("manager") || hasRole("supervisor")) && <div className="flex gap-1 sm:gap-2">
                                            <Button variant="outline" size="sm" className="h-7 sm:h-9 px-2 sm:px-3" onClick={() => setDriverToSwitch({
                                driverIds: [driver.id],
                                currentDispatcherId: dispatcherFleet.dispatcher.id
                              })}>
                                              <ArrowRightLeft className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                              <span className="hidden sm:inline">Switch</span>
                                            </Button>
                                            <Button variant="outline" size="sm" className="h-7 sm:h-9 px-2 sm:px-3" onClick={() => handleRemoveDriver(driver.id)}>
                                              <Minus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                              <span className="hidden sm:inline">Remove</span>
                                            </Button>
                                          </div>}
                                      </div>}
                                  </Draggable>);
                      });
                      return renderedItems;
                    })()}
                            {provided.placeholder}
                          </div>)}
                        {totalPages > 1 && <div className="mt-4 pt-4 border-t">
                            <Pagination>
                              <PaginationContent>
                                <PaginationItem>
                                  <PaginationPrevious onClick={() => setPage(pageKey, Math.max(1, currentPage - 1))} className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                </PaginationItem>

                                {Array.from({
                          length: totalPages
                        }, (_, i) => i + 1).map(page => <PaginationItem key={page}>
                                    <PaginationLink onClick={() => setPage(pageKey, page)} isActive={currentPage === page} className="cursor-pointer">
                                      {page}
                                    </PaginationLink>
                                  </PaginationItem>)}

                                <PaginationItem>
                                  <PaginationNext onClick={() => setPage(pageKey, Math.min(totalPages, currentPage + 1))} className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                </PaginationItem>
                              </PaginationContent>
                            </Pagination>
                          </div>}
                      </CardContent>
                    </Card>}
                </Droppable>;
          })}

            {/* Dispatchers with no drivers */}
            {filterDispatchers(dispatchers.filter(d => d.drivers.length === 0)).length > 0 && <div className="space-y-3 sm:space-y-4">
                <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                  Available Dispatchers
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {filterDispatchers(dispatchers.filter(d => d.drivers.length === 0)).map(dispatcherFleet => <Droppable key={dispatcherFleet.dispatcher.id} droppableId={`dispatcher-${dispatcherFleet.dispatcher.id}`}>
                      {(provided, snapshot) => <Card ref={provided.innerRef} {...provided.droppableProps} className={`transition-colors ${snapshot.isDraggingOver ? "bg-primary/5 border-primary" : ""}`}>
                          <CardContent className="p-3 sm:p-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <UserCheck className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-sm sm:text-base font-medium truncate">
                                    {dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email}
                                    {dispatcherFleet.dispatcher.ext && <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1 sm:ml-2">
                                        ext {dispatcherFleet.dispatcher.ext}
                                      </span>}
                                  </div>
                                  <div className="text-xs sm:text-sm text-muted-foreground">
                                    {snapshot.isDraggingOver ? "Drop driver here" : "No drivers assigned"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant={dispatcherFleet.isActive ? "outline" : "secondary"} className="text-xs">
                                  {dispatcherFleet.isActive ? "Available" : "Off Duty"}
                                </Badge>
                                {/* Toggle buttons - Only visible to managers and admins */}
                                {(hasRole("manager") || hasRole("admin")) && !dispatcherFleet.isActive && (
                                  <Button variant="default" size="sm" className="text-xs h-7" onClick={() => setDispatcherActive(dispatcherFleet.dispatcher.id)} disabled={loading}>
                                    Set Active
                                  </Button>
                                )}
                              </div>
                            </div>
                            {provided.placeholder}
                          </CardContent>
                        </Card>}
                    </Droppable>)}
                </div>
              </div>}

            {/* Unassigned Drivers */}
            {availableDrivers.length > 0 && (() => {
            const filteredUnassigned = filterDrivers(availableDrivers);
            const pageKey = "unassigned";
            const {
              drivers: paginatedDrivers,
              totalPages,
              currentPage
            } = getPaginatedDrivers(filteredUnassigned, pageKey);
            return <Droppable droppableId="unassigned">
                    {(provided, snapshot) => <Card ref={provided.innerRef} {...provided.droppableProps} className={`transition-colors ${snapshot.isDraggingOver ? "bg-warning/5 border-warning" : ""}`}>
                        <CardHeader className="p-3 sm:p-6">
                          <CardTitle className="flex items-center gap-2 flex-wrap text-sm sm:text-base">
                            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                            <span>Unassigned Drivers</span>
                            <Badge variant="outline" className="text-xs">{filteredUnassigned.length} drivers</Badge>
                            {snapshot.isDraggingOver && <Badge variant="outline" className="animate-pulse text-xs">
                                Drop to unassign
                              </Badge>}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                          <div className="grid gap-2">
                            {paginatedDrivers.map((driver, index) => <Draggable key={driver.id} draggableId={driver.id} index={index}>
                                {(provided, snapshot) => <div ref={provided.innerRef} {...provided.draggableProps} className={`flex items-center justify-between p-2 sm:p-3 border rounded-lg transition-transform hover:shadow-md ${snapshot.isDragging ? "shadow-lg scale-105 bg-background rotate-2" : ""}`}>
                                    <div className="flex items-center gap-2 sm:gap-3">
                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                        <GripVertical className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                      </div>
                                      <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                                      <div>
                                        <div className="text-sm sm:text-base font-medium flex items-center gap-2">
                                          {driver.name}
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="inline-flex">
                                                <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
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
                                        <div className="text-xs sm:text-sm text-muted-foreground">
                                          {driver.truck ? `Truck ${driver.truck.truck_number}` : "No truck assigned"}
                                        </div>
                                      </div>
                                    </div>
                                    <Badge variant="secondary" className="text-xs">Available</Badge>
                                  </div>}
                              </Draggable>)}
                            {provided.placeholder}
                          </div>
                          {totalPages > 1 && <div className="mt-4 pt-4 border-t">
                              <Pagination>
                                <PaginationContent>
                                  <PaginationItem>
                                    <PaginationPrevious onClick={() => setPage(pageKey, Math.max(1, currentPage - 1))} className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                  </PaginationItem>

                                  {Array.from({
                          length: totalPages
                        }, (_, i) => i + 1).map(page => <PaginationItem key={page}>
                                      <PaginationLink onClick={() => setPage(pageKey, page)} isActive={currentPage === page} className="cursor-pointer">
                                        {page}
                                      </PaginationLink>
                                    </PaginationItem>)}

                                  <PaginationItem>
                                    <PaginationNext onClick={() => setPage(pageKey, Math.min(totalPages, currentPage + 1))} className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                  </PaginationItem>
                                </PaginationContent>
                              </Pagination>
                            </div>}
                        </CardContent>
                      </Card>}
                  </Droppable>;
          })()}
              </TabsContent>

              <TabsContent value="supervisors" className="mt-4">
                <SupervisorsSection allDispatchers={allDispatchers} hasRole={hasRole} />
              </TabsContent>

              <TabsContent value="afterhours" className="mt-4">
                <AfterhoursFleetTab hasRole={hasRole} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={driverToRemove !== null} onOpenChange={open => !open && setDriverToRemove(null)}>
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
      <Dialog open={driverToSwitch !== null} onOpenChange={open => !open && setDriverToSwitch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch Dispatcher</DialogTitle>
            <DialogDescription>Select a new dispatcher for this driver</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Combobox options={allDispatchers.filter(d => d.id !== driverToSwitch?.currentDispatcherId).map(dispatcher => ({
            value: dispatcher.id,
            label: `${dispatcher.full_name || dispatcher.email}${dispatcher.ext ? ` (ext ${dispatcher.ext})` : ""}`
          }))} value={selectedDispatcher} onValueChange={setSelectedDispatcher} placeholder="Search dispatchers..." emptyText="No dispatcher found." />
            <Button onClick={handleSwitchDispatcher} className="w-full" disabled={!selectedDispatcher}>
              Switch Dispatcher
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Off Duty Confirmation Dialog */}
      <AlertDialog open={dispatcherToToggle !== null} onOpenChange={open => {
      if (!open) {
        setDispatcherToToggle(null);
        setDriverCoverAssignments({});
        setDayOffToggle(false);
      }
    }}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-center justify-between">
              <AlertDialogTitle>Set Dispatcher as Off Duty?</AlertDialogTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="day-off-toggle" className="text-sm font-normal">Day off</Label>
                <Switch id="day-off-toggle" checked={dayOffToggle} onCheckedChange={setDayOffToggle} />
              </div>
            </div>
            <AlertDialogDescription>
              <div className="space-y-4">
                <p>Assign a cover dispatcher for each driver currently assigned to {dispatcherToToggle?.name}.</p>
                <div className="space-y-3">
                  {(() => {
                    if (!dispatcherToToggle?.drivers) return null;
                    // Group drivers by truck to treat teams as one unit
                    const groupedByTruck = new Map<string, any[]>();
                    const noTruckDrivers: any[] = [];
                    dispatcherToToggle.drivers.forEach(driver => {
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

                    const entries: JSX.Element[] = [];

                    groupedByTruck.forEach((drivers, truckNum) => {
                      const isTeam = drivers.length > 1;
                      const firstDriverId = drivers[0].id;
                      entries.push(
                        <div key={`truck-${truckNum}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-3 border rounded-lg">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Users className="h-4 w-4 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {isTeam ? "TEAM" : drivers[0].name}
                                {isTeam && <span className="text-xs text-muted-foreground ml-2">({drivers.map(d => d.name).join(" & ")})</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">Truck {truckNum}</div>
                            </div>
                          </div>
                          <Combobox value={driverCoverAssignments[firstDriverId] || ""} onValueChange={value => setDriverCoverAssignments(prev => {
                            const updated = { ...prev };
                            // Set same cover dispatcher for all drivers in the team
                            drivers.forEach(d => { updated[d.id] = value; });
                            return updated;
                          })} options={allDispatchers.filter(d => d.id !== dispatcherToToggle?.id).map(dispatcher => ({
                            value: dispatcher.id,
                            label: `${dispatcher.full_name || dispatcher.email}${dispatcher.ext ? ` (ext ${dispatcher.ext})` : ""}`
                          }))} placeholder="Select cover..." emptyText="No dispatchers found" searchPlaceholder="Search dispatchers..." className="w-full sm:w-[250px]" />
                        </div>
                      );
                    });

                    noTruckDrivers.forEach(driver => {
                      entries.push(
                        <div key={driver.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-3 border rounded-lg">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Users className="h-4 w-4 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{driver.name}</div>
                            </div>
                          </div>
                          <Combobox value={driverCoverAssignments[driver.id] || ""} onValueChange={value => setDriverCoverAssignments(prev => ({
                            ...prev,
                            [driver.id]: value
                          }))} options={allDispatchers.filter(d => d.id !== dispatcherToToggle?.id).map(dispatcher => ({
                            value: dispatcher.id,
                            label: `${dispatcher.full_name || dispatcher.email}${dispatcher.ext ? ` (ext ${dispatcher.ext})` : ""}`
                          }))} placeholder="Select cover..." emptyText="No dispatchers found" searchPlaceholder="Search dispatchers..." className="w-full sm:w-[250px]" />
                        </div>
                      );
                    });

                    return entries;
                  })()}
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
            <AlertDialogAction onClick={confirmToggleOffDuty} disabled={Object.values(driverCoverAssignments).some(v => !v)}>
              Set Off Duty
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AfterhoursScheduleDialog open={isAfterhoursScheduleOpen} onOpenChange={setIsAfterhoursScheduleOpen} />
      
      <DispatcherBonusesDialog open={isBonusesDialogOpen} onOpenChange={setIsBonusesDialogOpen} dispatchers={allDispatchers.filter((d: any) => d.roles?.includes("dispatch") || d.roles?.includes("supervisor")).map((d: any) => ({
      id: d.id,
      full_name: d.full_name,
      email: d.email
    }))} selectedMonth={bonusMonth} />
    </DragDropContext>;
};
export default Fleets;