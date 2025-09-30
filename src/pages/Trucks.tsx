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
import { useCompanies } from "@/hooks/useCompanies";
import { supabase } from "@/integrations/supabase/client";
import { useTrailers } from "@/hooks/useTrailers";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { useToast } from "@/hooks/use-toast";
interface TruckFormData {
  truck_number: string;
  trailer_id: string;
  driver_id: string;
  dispatcher_id: string;
  company_id: string;
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
    driver_id: "",
    dispatcher_id: "",
    company_id: "",
    model: ""
  });
  const {
    toast
  } = useToast();
  const {
    data: trucks,
    isLoading,
    refetch
  } = useTrucks();
  const {
    data: drivers
  } = useDrivers();
  const {
    data: trailers
  } = useTrailers();
  const {
    data: companies
  } = useCompanies();
  const {
    allDispatchers
  } = useFleetManagement();

  // Filter trucks based on search term
  const filteredTrucks = trucks?.filter(truck => truck.truck_number.toLowerCase().includes(searchTerm.toLowerCase()) || truck.dispatcher?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.dispatcher?.email?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.model?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.driver1?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.trailer?.trailer_number?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.company?.name?.toLowerCase().includes(searchTerm.toLowerCase())) || [];
  const resetForm = () => {
    setFormData({
      truck_number: "",
      trailer_id: "",
      driver_id: "",
      dispatcher_id: "",
      company_id: "",
      model: ""
    });
  };
  const handleAddTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const {
        error
      } = await supabase.from('trucks').insert({
        truck_number: formData.truck_number,
        trailer_id: formData.trailer_id || null,
        driver1_id: formData.driver_id || null,
        dispatcher_id: formData.dispatcher_id || null,
        company_id: formData.company_id || null,
        model: formData.model || null
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Truck added successfully"
      });
      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add truck",
        variant: "destructive"
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
      const {
        error
      } = await supabase.from('trucks').update({
        truck_number: formData.truck_number,
        trailer_id: formData.trailer_id || null,
        driver1_id: formData.driver_id || null,
        dispatcher_id: formData.dispatcher_id || null,
        company_id: formData.company_id || null,
        model: formData.model || null
      }).eq('id', editingTruck.id);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Truck updated successfully"
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingTruck(null);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update truck",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteTruck = async (truckId: string) => {
    try {
      const {
        error
      } = await supabase.from('trucks').delete().eq('id', truckId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Truck deleted successfully"
      });
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete truck",
        variant: "destructive"
      });
    }
  };
  const openEditDialog = (truck: any) => {
    setEditingTruck(truck);
    setFormData({
      truck_number: truck.truck_number || "",
      trailer_id: truck.trailer_id || "",
      driver_id: truck.driver1_id || "",
      dispatcher_id: truck.dispatcher_id || "",
      company_id: truck.company_id || "",
      model: truck.model || ""
    });
    setIsEditDialogOpen(true);
  };
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>;
  }

  // Filter out drivers who already have a truck assigned (excluding the current truck being edited)
  const availableDrivers = drivers?.filter(driver => {
    // If we're editing a truck, allow the currently assigned driver to remain in the list
    if (editingTruck && (editingTruck.driver1_id === driver.id || editingTruck.driver2_id === driver.id)) {
      return true;
    }
    // Check if this driver is assigned to any truck
    const isAssigned = trucks?.some(truck => truck.driver1_id === driver.id || truck.driver2_id === driver.id);
    return !isAssigned;
  }) || [];
  const driverOptions = availableDrivers.map(driver => ({
    value: driver.id,
    label: driver.name
  }));
  const trailerOptions = trailers?.map(trailer => ({
    value: trailer.id,
    label: trailer.trailer_number
  })) || [];
  const dispatcherOptions = allDispatchers?.map(dispatcher => ({
    value: dispatcher.id,
    label: dispatcher.full_name || dispatcher.email
  })) || [];
  const companyOptions = companies?.map(company => ({
    value: company.id,
    label: company.name
  })) || [];
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground px-[10px]">Trucks</h1>
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
                  <Input id="truck_number" value={formData.truck_number} onChange={e => setFormData({
                  ...formData,
                  truck_number: e.target.value
                })} placeholder="TRK-001" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_id">Company</Label>
                  <Select value={formData.company_id} onValueChange={value => setFormData({
                  ...formData,
                  company_id: value
                })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyOptions.map(company => <SelectItem key={company.value} value={company.value}>
                          {company.label}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dispatcher_id">Dispatcher</Label>
                  <Select value={formData.dispatcher_id} onValueChange={value => setFormData({
                  ...formData,
                  dispatcher_id: value
                })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select dispatcher" />
                    </SelectTrigger>
                    <SelectContent>
                      {dispatcherOptions.map(dispatcher => <SelectItem key={dispatcher.value} value={dispatcher.value}>
                          {dispatcher.label}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driver_id">Driver</Label>
                  <Select value={formData.driver_id} onValueChange={value => setFormData({
                  ...formData,
                  driver_id: value
                })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {driverOptions.map(driver => <SelectItem key={driver.value} value={driver.value}>
                          {driver.label}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trailer_id">Trailer Number</Label>
                  <Select value={formData.trailer_id} onValueChange={value => setFormData({
                  ...formData,
                  trailer_id: value
                })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trailer" />
                    </SelectTrigger>
                    <SelectContent>
                      {trailerOptions.map(trailer => <SelectItem key={trailer.value} value={trailer.value}>
                          {trailer.label}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" value={formData.model} onChange={e => setFormData({
                ...formData,
                model: e.target.value
              })} placeholder="2023 Freightliner Cascadia" />
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
              <Input placeholder="Search trucks..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Trailer #</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Dispatcher</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {filteredTrucks.length === 0 ? <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No trucks found
                    </TableCell>
                  </TableRow> : filteredTrucks.map(truck => <TableRow key={truck.id}>
                      <TableCell className="font-medium">{truck.truck_number}</TableCell>
                      <TableCell>{truck.company?.name || "—"}</TableCell>
                      <TableCell>{truck.trailer?.trailer_number || "—"}</TableCell>
                      <TableCell>{truck.driver1?.name || "—"}</TableCell>
                      <TableCell>{truck.dispatcher?.full_name || truck.dispatcher?.email || "—"}</TableCell>
                      <TableCell>{truck.model || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(truck)}>
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
                    </TableRow>)}
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
                <Input id="edit_truck_number" value={formData.truck_number} onChange={e => setFormData({
                ...formData,
                truck_number: e.target.value
              })} placeholder="TRK-001" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_company_id">Company</Label>
                <Select value={formData.company_id} onValueChange={value => setFormData({
                ...formData,
                company_id: value
              })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companyOptions.map(company => <SelectItem key={company.value} value={company.value}>
                        {company.label}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_dispatcher_id">Dispatcher</Label>
                <Select value={formData.dispatcher_id} onValueChange={value => setFormData({
                ...formData,
                dispatcher_id: value
              })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select dispatcher" />
                  </SelectTrigger>
                  <SelectContent>
                    {dispatcherOptions.map(dispatcher => <SelectItem key={dispatcher.value} value={dispatcher.value}>
                        {dispatcher.label}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_driver_id">Driver</Label>
                <Select value={formData.driver_id} onValueChange={value => setFormData({
                ...formData,
                driver_id: value
              })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {driverOptions.map(driver => <SelectItem key={driver.value} value={driver.value}>
                        {driver.label}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_trailer_id">Trailer Number</Label>
                <Select value={formData.trailer_id} onValueChange={value => setFormData({
                ...formData,
                trailer_id: value
              })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trailer" />
                  </SelectTrigger>
                  <SelectContent>
                    {trailerOptions.map(trailer => <SelectItem key={trailer.value} value={trailer.value}>
                        {trailer.label}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_model">Model</Label>
              <Input id="edit_model" value={formData.model} onChange={e => setFormData({
              ...formData,
              model: e.target.value
            })} placeholder="2023 Freightliner Cascadia" />
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
    </div>;
};
export default Trucks;