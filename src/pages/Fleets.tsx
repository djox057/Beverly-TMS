import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Truck, Users, Plus, Minus, Loader2, Move } from "lucide-react";
import { useFleetManagement, useUpdateTruckFleet, useAvailableFleets } from "@/hooks/useFleetManagement";

const Fleets = () => {
  const { data: fleetGroups, isLoading, error } = useFleetManagement();
  const { data: availableFleets } = useAvailableFleets();
  const updateTruckFleet = useUpdateTruckFleet();
  
  const [isCreateFleetOpen, setIsCreateFleetOpen] = useState(false);
  const [newFleetName, setNewFleetName] = useState("");
  const [selectedTruckForMove, setSelectedTruckForMove] = useState<string | null>(null);

  const handleMoveTruck = async (truckId: string, newFleet: string) => {
    await updateTruckFleet.mutateAsync({
      truckId,
      fleetAssignment: newFleet === 'unassigned' ? null : newFleet
    });
    setSelectedTruckForMove(null);
  };

  const handleRemoveFromFleet = async (truckId: string) => {
    await updateTruckFleet.mutateAsync({
      truckId,
      fleetAssignment: null
    });
  };

  const handleCreateFleet = async () => {
    if (!newFleetName.trim()) return;
    
    // Create fleet by updating the first unassigned truck to this fleet
    const unassignedTrucks = fleetGroups?.['Unassigned'] || [];
    if (unassignedTrucks.length > 0) {
      await updateTruckFleet.mutateAsync({
        truckId: unassignedTrucks[0].id,
        fleetAssignment: newFleetName.trim()
      });
    }
    
    setNewFleetName("");
    setIsCreateFleetOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8 text-destructive">
          Error loading fleet data: {error.message}
        </div>
      </div>
    );
  }

  const fleetNames = Object.keys(fleetGroups || {}).sort();
  const totalTrucks = Object.values(fleetGroups || {}).flat().length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Fleet Assignment</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-4 w-4" />
            {totalTrucks} Total Trucks
          </div>
          <Dialog open={isCreateFleetOpen} onOpenChange={setIsCreateFleetOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Fleet
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Fleet</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fleet-name">Fleet Name</Label>
                  <Input
                    id="fleet-name"
                    value={newFleetName}
                    onChange={(e) => setNewFleetName(e.target.value)}
                    placeholder="e.g., Fleet A, East Coast, etc."
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsCreateFleetOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateFleet} disabled={!newFleetName.trim()}>
                    Create Fleet
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Fleet Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Fleets</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {fleetNames.filter(name => name !== 'Unassigned').length}
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
              {totalTrucks - (fleetGroups?.['Unassigned']?.length || 0)}
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
              {fleetGroups?.['Unassigned']?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fleet Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {fleetNames.map((fleetName) => {
          const trucks = fleetGroups?.[fleetName] || [];
          const isUnassigned = fleetName === 'Unassigned';
          
          return (
            <Card key={fleetName}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {fleetName}
                    <Badge variant={isUnassigned ? "secondary" : "default"}>
                      {trucks.length} trucks
                    </Badge>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trucks.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      No trucks in this fleet
                    </div>
                  ) : (
                    trucks.map((truck) => (
                      <div
                        key={truck.id}
                        className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{truck.truck_number}</div>
                            <div className="text-sm text-muted-foreground">
                              Driver: {truck.driver1?.name || "Unassigned"} | 
                              Trailer: {truck.trailer?.trailer_number || "None"}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {/* Move to Fleet */}
                          {selectedTruckForMove === truck.id ? (
                            <div className="flex items-center gap-2">
                              <Select onValueChange={(value) => handleMoveTruck(truck.id, value)}>
                                <SelectTrigger className="w-32">
                                  <SelectValue placeholder="Move to..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {availableFleets?.filter(f => f !== fleetName).map((fleet) => (
                                    <SelectItem key={fleet} value={fleet}>
                                      {fleet}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedTruckForMove(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedTruckForMove(truck.id)}
                              >
                                <Move className="h-3 w-3 mr-1" />
                                Move
                              </Button>
                              
                              {!isUnassigned && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRemoveFromFleet(truck.id)}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Fleets;