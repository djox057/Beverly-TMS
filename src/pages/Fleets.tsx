import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Truck, Plus, Minus, Users, UserCheck, GripVertical, Search, Info, ArrowRightLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { Label } from "@/components/ui/label";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

const Fleets = () => {
  const { 
    dispatchers, 
    availableTrucks,
    allDispatchers,
    loading, 
    assignTruckToDispatcher, 
    removeTruckFromDispatcher
  } = useFleetManagement();

  const [selectedTruck, setSelectedTruck] = useState("");
  const [selectedDispatcher, setSelectedDispatcher] = useState("");
  const [isAssignTruckOpen, setIsAssignTruckOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPages, setCurrentPages] = useState<Record<string, number>>({});
  const [truckToRemove, setTruckToRemove] = useState<string | null>(null);
  const [truckToSwitch, setTruckToSwitch] = useState<{ truckId: string; currentDispatcherId: string } | null>(null);

  const itemsPerPage = 10;

  // Filter trucks by search term
  const filterTrucks = (trucks: any[]) => {
    if (!searchTerm) return trucks;
    return trucks.filter(truck => 
      truck.truck_number.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Get paginated trucks
  const getPaginatedTrucks = (trucks: any[], pageKey: string) => {
    const currentPage = currentPages[pageKey] || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      trucks: trucks.slice(startIndex, endIndex),
      totalPages: Math.ceil(trucks.length / itemsPerPage),
      currentPage
    };
  };

  const setPage = (pageKey: string, page: number) => {
    setCurrentPages(prev => ({ ...prev, [pageKey]: page }));
  };

  const handleAssignTruck = async () => {
    if (selectedTruck && selectedDispatcher) {
      await assignTruckToDispatcher(selectedTruck, selectedDispatcher);
      setSelectedTruck("");
      setSelectedDispatcher("");
      setIsAssignTruckOpen(false);
    }
  };

  const handleRemoveTruck = async (truckId: string) => {
    setTruckToRemove(truckId);
  };

  const confirmRemoveTruck = async () => {
    if (truckToRemove) {
      await removeTruckFromDispatcher(truckToRemove);
      setTruckToRemove(null);
    }
  };

  const handleSwitchDispatcher = async () => {
    if (truckToSwitch && selectedDispatcher) {
      await assignTruckToDispatcher(truckToSwitch.truckId, selectedDispatcher);
      setTruckToSwitch(null);
      setSelectedDispatcher("");
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // If no destination or dropped in same place, do nothing
    if (!destination || 
        (destination.droppableId === source.droppableId && 
         destination.index === source.index)) {
      return;
    }

    const truckId = draggableId;
    
    // Handle different drop destinations
    if (destination.droppableId === 'unassigned') {
      // Remove truck from dispatcher
      await removeTruckFromDispatcher(truckId);
    } else if (destination.droppableId.startsWith('dispatcher-')) {
      // Assign truck to dispatcher
      const dispatcherId = destination.droppableId.replace('dispatcher-', '');
      await assignTruckToDispatcher(truckId, dispatcherId);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-center">Loading dispatcher fleet data...</div>
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
              <Dialog open={isAssignTruckOpen} onOpenChange={setIsAssignTruckOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Assign Truck to Dispatcher
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Truck to Dispatcher</DialogTitle>
                    <DialogDescription>
                      Select a truck and dispatcher to assign, or simply drag and drop!
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Select Truck</Label>
                      <Select value={selectedTruck} onValueChange={setSelectedTruck}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a truck" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTrucks.map((truck) => (
                            <SelectItem key={truck.id} value={truck.id}>
                              {truck.truck_number} - {truck.make} {truck.model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Select Dispatcher</Label>
                      <Select value={selectedDispatcher} onValueChange={setSelectedDispatcher}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a dispatcher" />
                        </SelectTrigger>
                        <SelectContent>
                          {allDispatchers.map((dispatcher) => (
                            <SelectItem key={dispatcher.id} value={dispatcher.id}>
                              {dispatcher.full_name || dispatcher.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleAssignTruck} className="w-full">
                      Assign Truck
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
              placeholder="Search trucks by number..." 
              className="pl-10" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Fleet Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Dispatchers</CardTitle>
                  <UserCheck className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {dispatchers.filter(d => d.trucks.length > 0).length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Assigned Trucks</CardTitle>
                  <Truck className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">
                    {dispatchers.reduce((total, d) => total + d.trucks.length, 0)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unassigned Trucks</CardTitle>
                  <Truck className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">
                    {availableTrucks.length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Dispatcher Fleets */}
            {dispatchers.filter(d => d.trucks.length > 0).map((dispatcherFleet) => {
              const filteredTrucks = filterTrucks(dispatcherFleet.trucks);
              
              // Hide dispatcher if searching and no matching trucks
              if (searchTerm && filteredTrucks.length === 0) {
                return null;
              }
              
              const pageKey = `dispatcher-${dispatcherFleet.dispatcher.id}`;
              const { trucks: paginatedTrucks, totalPages, currentPage } = getPaginatedTrucks(filteredTrucks, pageKey);
              
              return (
            <Droppable key={dispatcherFleet.dispatcher.id} droppableId={`dispatcher-${dispatcherFleet.dispatcher.id}`}>
              {(provided, snapshot) => (
                <Card 
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`transition-colors ${snapshot.isDraggingOver ? 'bg-primary/5 border-primary' : ''}`}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5" />
                      {dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email}
                      {dispatcherFleet.dispatcher.ext && (
                        <span className="text-sm font-normal text-muted-foreground">ext {dispatcherFleet.dispatcher.ext}</span>
                      )}
                      <Badge variant="secondary">{filteredTrucks.length} trucks</Badge>
                      {snapshot.isDraggingOver && (
                        <Badge variant="outline" className="animate-pulse">Drop here</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2">
                      {paginatedTrucks.map((truck, index) => (
                        <Draggable key={truck.id} draggableId={truck.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center justify-between p-3 border rounded-lg transition-transform hover:shadow-md ${
                                snapshot.isDragging ? 'shadow-lg scale-105 bg-background rotate-2' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div 
                                  {...provided.dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <Truck className="h-4 w-4" />
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {truck.truck_number}
                                    {truck.driver1 && (
                                      <>
                                        <span className="text-muted-foreground">•</span>
                                        <span className="text-sm font-normal">{truck.driver1.name}</span>
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button className="inline-flex">
                                              <Info className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto">
                                            <div className="space-y-1">
                                              <p className="font-semibold">{truck.driver1.name}</p>
                                              {truck.driver1.phone && (
                                                <p className="text-sm">📞 {truck.driver1.phone}</p>
                                              )}
                                              {truck.driver1.email && (
                                                <p className="text-sm">✉️ {truck.driver1.email}</p>
                                              )}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      </>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {truck.make} {truck.model} {truck.year}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setTruckToSwitch({ truckId: truck.id, currentDispatcherId: dispatcherFleet.dispatcher.id })}
                                >
                                  <ArrowRightLeft className="h-4 w-4 mr-1" />
                                  Switch
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRemoveTruck(truck.id)}
                                >
                                  <Minus className="h-4 w-4 mr-1" />
                                  Remove
                                </Button>
                              </div>
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
                                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
            )}
            )}

            {/* Dispatchers with no trucks */}
            {dispatchers.filter(d => d.trucks.length === 0).length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Available Dispatchers
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dispatchers.filter(d => d.trucks.length === 0).map((dispatcherFleet) => (
                    <Droppable key={dispatcherFleet.dispatcher.id} droppableId={`dispatcher-${dispatcherFleet.dispatcher.id}`}>
                      {(provided, snapshot) => (
                        <Card 
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`transition-colors ${snapshot.isDraggingOver ? 'bg-primary/5 border-primary' : ''}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <UserCheck className="h-4 w-4" />
                                <div>
                                  <div className="font-medium">
                                    {dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email}
                                    {dispatcherFleet.dispatcher.ext && (
                                      <span className="text-sm font-normal text-muted-foreground ml-2">ext {dispatcherFleet.dispatcher.ext}</span>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {snapshot.isDraggingOver ? 'Drop truck here' : 'No trucks assigned'}
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

            {/* Unassigned Trucks */}
            {availableTrucks.length > 0 && (() => {
              const filteredUnassigned = filterTrucks(availableTrucks);
              const pageKey = 'unassigned';
              const { trucks: paginatedTrucks, totalPages, currentPage } = getPaginatedTrucks(filteredUnassigned, pageKey);
              
              return (
              <Droppable droppableId="unassigned">
                {(provided, snapshot) => (
                  <Card 
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`transition-colors ${snapshot.isDraggingOver ? 'bg-warning/5 border-warning' : ''}`}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Unassigned Trucks
                        <Badge variant="outline">{filteredUnassigned.length} trucks</Badge>
                        {snapshot.isDraggingOver && (
                          <Badge variant="outline" className="animate-pulse">Drop to unassign</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-2">
                        {paginatedTrucks.map((truck, index) => (
                          <Draggable key={truck.id} draggableId={truck.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`flex items-center justify-between p-3 border rounded-lg transition-transform hover:shadow-md ${
                                  snapshot.isDragging ? 'shadow-lg scale-105 bg-background rotate-2' : ''
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div 
                                    {...provided.dragHandleProps}
                                    className="cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  </div>
                              <Truck className="h-4 w-4" />
                              <div>
                                <div className="font-medium flex items-center gap-2">
                                  {truck.truck_number}
                                  {truck.driver1 && (
                                    <>
                                      <span className="text-muted-foreground">•</span>
                                      <span className="text-sm font-normal">{truck.driver1.name}</span>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="inline-flex">
                                            <Info className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto">
                                          <div className="space-y-1">
                                            <p className="font-semibold">{truck.driver1.name}</p>
                                            {truck.driver1.phone && (
                                              <p className="text-sm">📞 {truck.driver1.phone}</p>
                                            )}
                                            {truck.driver1.email && (
                                              <p className="text-sm">✉️ {truck.driver1.email}</p>
                                            )}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {truck.make} {truck.model} {truck.year}
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
                                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
      <AlertDialog open={truckToRemove !== null} onOpenChange={(open) => !open && setTruckToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Truck from Dispatcher</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this truck from its dispatcher? The truck will be moved to the unassigned trucks list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveTruck}>
              Remove Truck
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Switch Dispatcher Dialog */}
      <Dialog open={truckToSwitch !== null} onOpenChange={(open) => !open && setTruckToSwitch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch Dispatcher</DialogTitle>
            <DialogDescription>
              Select a new dispatcher for this truck
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select New Dispatcher</Label>
              <Select value={selectedDispatcher} onValueChange={setSelectedDispatcher}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a dispatcher" />
                </SelectTrigger>
                <SelectContent>
                  {allDispatchers
                    .filter(d => d.id !== truckToSwitch?.currentDispatcherId)
                    .map((dispatcher) => (
                      <SelectItem key={dispatcher.id} value={dispatcher.id}>
                        {dispatcher.full_name || dispatcher.email}
                        {dispatcher.ext && ` (ext ${dispatcher.ext})`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSwitchDispatcher} className="w-full" disabled={!selectedDispatcher}>
              Switch Dispatcher
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DragDropContext>
  );
};

export default Fleets;