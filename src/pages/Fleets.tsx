import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Truck, Plus, Minus, Users, UserCheck } from "lucide-react";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { Label } from "@/components/ui/label";

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

  const handleAssignTruck = async () => {
    if (selectedTruck && selectedDispatcher) {
      await assignTruckToDispatcher(selectedTruck, selectedDispatcher);
      setSelectedTruck("");
      setSelectedDispatcher("");
      setIsAssignTruckOpen(false);
    }
  };

  const handleRemoveTruck = async (truckId: string) => {
    await removeTruckFromDispatcher(truckId);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
                  Select a truck and dispatcher to assign
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

      <div className="grid gap-6">
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
        {dispatchers.filter(d => d.trucks.length > 0).map((dispatcherFleet) => (
          <Card key={dispatcherFleet.dispatcher.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                {dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email}
                <Badge variant="secondary">{dispatcherFleet.trucks.length} trucks</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {dispatcherFleet.trucks.map((truck) => (
                  <div key={truck.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Truck className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{truck.truck_number}</div>
                        <div className="text-sm text-muted-foreground">
                          {truck.make} {truck.model} {truck.year}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveTruck(truck.id)}
                    >
                      <Minus className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Dispatchers with no trucks */}
        {dispatchers.filter(d => d.trucks.length === 0).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Dispatchers without trucks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {dispatchers.filter(d => d.trucks.length === 0).map((dispatcherFleet) => (
                  <div key={dispatcherFleet.dispatcher.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <UserCheck className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{dispatcherFleet.dispatcher.full_name || dispatcherFleet.dispatcher.email}</div>
                        <div className="text-sm text-muted-foreground">No trucks assigned</div>
                      </div>
                    </div>
                    <Badge variant="outline">Available</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unassigned Trucks */}
        {availableTrucks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Unassigned Trucks
                <Badge variant="outline">{availableTrucks.length} trucks</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {availableTrucks.map((truck) => (
                  <div key={truck.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Truck className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{truck.truck_number}</div>
                        <div className="text-sm text-muted-foreground">
                          {truck.make} {truck.model} {truck.year}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary">Available</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Fleets;