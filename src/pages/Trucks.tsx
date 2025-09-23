import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TruckFormData {
  truck_number: string;
  trailer_id: string;
  driver1_id: string;
  driver2_id: string;
  fleet_assignment: string;
  truck_type: string;
  year: string;
  make: string;
  model: string;
}

const Trucks = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<TruckFormData>({
    truck_number: "",
    trailer_id: "",
    driver1_id: "",
    driver2_id: "",
    fleet_assignment: "",
    truck_type: "Semi-Truck",
    year: "",
    make: "",
    model: ""
  });

  const { toast } = useToast();
  const { data: trucks, isLoading, refetch } = useTrucks();
  const { data: drivers } = useDrivers();

  // Filter trucks based on search term
  const filteredTrucks = trucks?.filter(truck =>
    truck.truck_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    truck.fleet_assignment?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    truck.make?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    truck.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    truck.driver1?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    truck.driver2?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const resetForm = () => {
    setFormData({
      truck_number: "",
      trailer_id: "",
      driver1_id: "",
      driver2_id: "",
      fleet_assignment: "",
      truck_type: "Semi-Truck",
      year: "",
      make: "",
      model: ""
    });
  };

  const handleAddTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('trucks')
        .insert({
          truck_number: formData.truck_number,
          driver1_id: formData.driver1_id || null,
          driver2_id: formData.driver2_id || null,
          fleet_assignment: formData.fleet_assignment || null,
          truck_type: formData.truck_type,
          year: formData.year ? parseInt(formData.year) : null,
          make: formData.make || null,
          model: formData.model || null
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Truck added successfully",
      });

      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add truck",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTruck) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('trucks')
        .update({
          truck_number: formData.truck_number,
          driver1_id: formData.driver1_id || null,
          driver2_id: formData.driver2_id || null,
          fleet_assignment: formData.fleet_assignment || null,
          truck_type: formData.truck_type,
          year: formData.year ? parseInt(formData.year) : null,
          make: formData.make || null,
          model: formData.model || null
        })
        .eq('id', editingTruck.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Truck updated successfully",
      });

      resetForm();
      setIsEditDialogOpen(false);
      setEditingTruck(null);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update truck",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTruck = async (truckId: string) => {
    try {
      const { error } = await supabase
        .from('trucks')
        .delete()
        .eq('id', truckId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Truck deleted successfully",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete truck",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (truck: any) => {
    setEditingTruck(truck);
    setFormData({
      truck_number: truck.truck_number || "",
      trailer_id: truck.trailer_id || "",
      driver1_id: truck.driver1_id || "",
      driver2_id: truck.driver2_id || "",
      fleet_assignment: truck.fleet_assignment || "",
      truck_type: truck.truck_type || "Semi-Truck",
      year: truck.year?.toString() || "",
      make: truck.make || "",
      model: truck.model || ""
    });
    setIsEditDialogOpen(true);
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

  const driverOptions = drivers?.map(driver => ({
    value: driver.id,
    label: driver.name
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Trucks</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Add Truck
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Truck</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddTruck} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="truck_number">Truck Number*</Label>
                  <Input
                    id="truck_number"
                    value={formData.truck_number}
                    onChange={(e) => setFormData({ ...formData, truck_number: e.target.value })}
                    placeholder="TRK-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fleet_assignment">Fleet Assignment</Label>
                  <Input
                    id="fleet_assignment"
                    value={formData.fleet_assignment}
                    onChange={(e) => setFormData({ ...formData, fleet_assignment: e.target.value })}
                    placeholder="Fleet A"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driver1_id">Primary Driver</Label>
                  <Select value={formData.driver1_id} onValueChange={(value) => setFormData({ ...formData, driver1_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select primary driver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {driverOptions.map((driver) => (
                        <SelectItem key={driver.value} value={driver.value}>
                          {driver.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driver2_id">Secondary Driver</Label>
                  <Select value={formData.driver2_id} onValueChange={(value) => setFormData({ ...formData, driver2_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select secondary driver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {driverOptions.map((driver) => (
                        <SelectItem key={driver.value} value={driver.value}>
                          {driver.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    placeholder="2023"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="make">Make</Label>
                  <Input
                    id="make"
                    value={formData.make}
                    onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                    placeholder="Freightliner"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="Cascadia"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="truck_type">Truck Type</Label>
                <Select value={formData.truck_type} onValueChange={(value) => setFormData({ ...formData, truck_type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Semi-Truck">Semi-Truck</SelectItem>
                    <SelectItem value="Box Truck">Box Truck</SelectItem>
                    <SelectItem value="Flatbed">Flatbed</SelectItem>
                    <SelectItem value="Tanker">Tanker</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Truck
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Truck Fleet</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search trucks..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Connected Trailer</TableHead>
                  <TableHead>Driver 1</TableHead>
                  <TableHead>Driver 2</TableHead>
                  <TableHead>Fleet Assignment</TableHead>
                  <TableHead>Vehicle Info</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrucks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No trucks found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTrucks.map((truck) => (
                    <TableRow key={truck.id}>
                      <TableCell className="font-medium">{truck.truck_number}</TableCell>
                      <TableCell>{truck.trailer?.trailer_number || "—"}</TableCell>
                      <TableCell>{truck.driver1?.name || "—"}</TableCell>
                      <TableCell>{truck.driver2?.name || "—"}</TableCell>
                      <TableCell>{truck.fleet_assignment || "—"}</TableCell>
                      <TableCell>
                        {truck.year || truck.make || truck.model ? 
                          `${truck.year || ''} ${truck.make || ''} ${truck.model || ''}`.trim() : 
                          "—"
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openEditDialog(truck)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete truck {truck.truck_number}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTruck(truck.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Truck</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditTruck} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_truck_number">Truck Number*</Label>
                <Input
                  id="edit_truck_number"
                  value={formData.truck_number}
                  onChange={(e) => setFormData({ ...formData, truck_number: e.target.value })}
                  placeholder="TRK-001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_fleet_assignment">Fleet Assignment</Label>
                <Input
                  id="edit_fleet_assignment"
                  value={formData.fleet_assignment}
                  onChange={(e) => setFormData({ ...formData, fleet_assignment: e.target.value })}
                  placeholder="Fleet A"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_driver1_id">Primary Driver</Label>
                <Select value={formData.driver1_id} onValueChange={(value) => setFormData({ ...formData, driver1_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select primary driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {driverOptions.map((driver) => (
                      <SelectItem key={driver.value} value={driver.value}>
                        {driver.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_driver2_id">Secondary Driver</Label>
                <Select value={formData.driver2_id} onValueChange={(value) => setFormData({ ...formData, driver2_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select secondary driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {driverOptions.map((driver) => (
                      <SelectItem key={driver.value} value={driver.value}>
                        {driver.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_year">Year</Label>
                <Input
                  id="edit_year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  placeholder="2023"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_make">Make</Label>
                <Input
                  id="edit_make"
                  value={formData.make}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  placeholder="Freightliner"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_model">Model</Label>
                <Input
                  id="edit_model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="Cascadia"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_truck_type">Truck Type</Label>
              <Select value={formData.truck_type} onValueChange={(value) => setFormData({ ...formData, truck_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Semi-Truck">Semi-Truck</SelectItem>
                  <SelectItem value="Box Truck">Box Truck</SelectItem>
                  <SelectItem value="Flatbed">Flatbed</SelectItem>
                  <SelectItem value="Tanker">Tanker</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Truck
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Trucks;