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
import { useTrailers } from "@/hooks/useTrailers";
import { supabase } from "@/integrations/supabase/client";
import { useTrucks } from "@/hooks/useTrucks";
import { useToast } from "@/hooks/use-toast";
interface TrailerFormData {
  trailer_number: string;
  trailer_type: string;
  truck_id: string;
}
const Trailers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTrailer, setEditingTrailer] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<TrailerFormData>({
    trailer_number: "",
    trailer_type: "",
    truck_id: ""
  });
  const {
    toast
  } = useToast();
  const {
    data: trailers,
    isLoading,
    refetch
  } = useTrailers();
  const {
    data: trucks
  } = useTrucks();

  // Filter trailers based on search term
  const filteredTrailers = trailers?.filter(trailer => trailer.trailer_number.toLowerCase().includes(searchTerm.toLowerCase()) || trailer.trailer_type?.toLowerCase().includes(searchTerm.toLowerCase()) || trailer.trucks && trailer.trucks.length > 0 && trailer.trucks[0].truck_number.toLowerCase().includes(searchTerm.toLowerCase())) || [];
  const resetForm = () => {
    setFormData({
      trailer_number: "",
      trailer_type: "",
      truck_id: ""
    });
  };
  const handleAddTrailer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // First add the trailer
      const {
        data: trailerData,
        error: trailerError
      } = await supabase.from('trailers').insert({
        trailer_number: formData.trailer_number,
        trailer_type: formData.trailer_type || null
      }).select().single();
      if (trailerError) throw trailerError;

      // Then update the truck if one was selected
      if (formData.truck_id && trailerData) {
        const {
          error: truckError
        } = await supabase.from('trucks').update({
          trailer_id: trailerData.id
        }).eq('id', formData.truck_id);
        if (truckError) throw truckError;
      }
      toast({
        title: "Success",
        description: "Trailer added successfully"
      });
      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add trailer",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleEditTrailer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrailer) return;
    setIsSubmitting(true);
    try {
      // Update the trailer
      const {
        error: trailerError
      } = await supabase.from('trailers').update({
        trailer_number: formData.trailer_number,
        trailer_type: formData.trailer_type || null
      }).eq('id', editingTrailer.id);
      if (trailerError) throw trailerError;

      // Handle truck assignment changes
      const currentTruck = editingTrailer.trucks?.[0];
      const newTruckId = formData.truck_id;

      // If there was a truck assigned and now it's different, clear the old assignment
      if (currentTruck && currentTruck.id !== newTruckId) {
        const {
          error: clearError
        } = await supabase.from('trucks').update({
          trailer_id: null
        }).eq('id', currentTruck.id);
        if (clearError) throw clearError;
      }

      // If a new truck is selected, assign this trailer to it
      if (newTruckId) {
        const {
          error: assignError
        } = await supabase.from('trucks').update({
          trailer_id: editingTrailer.id
        }).eq('id', newTruckId);
        if (assignError) throw assignError;
      }
      toast({
        title: "Success",
        description: "Trailer updated successfully"
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingTrailer(null);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update trailer",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteTrailer = async (trailerId: string) => {
    try {
      const {
        error
      } = await supabase.from('trailers').delete().eq('id', trailerId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Trailer deleted successfully"
      });
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete trailer",
        variant: "destructive"
      });
    }
  };
  const openEditDialog = (trailer: any) => {
    setEditingTrailer(trailer);
    setFormData({
      trailer_number: trailer.trailer_number || "",
      trailer_type: trailer.trailer_type || "",
      truck_id: trailer.trucks?.[0]?.id || ""
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

  // Get available trucks (trucks without trailers assigned)
  const availableTrucks = trucks?.filter(truck => !truck.trailer_id) || [];
  const truckOptions = availableTrucks.map(truck => ({
    value: truck.id,
    label: truck.truck_number
  }));
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground px-[10px]">Trailers</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Add Trailer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Trailer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddTrailer} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trailer_number">Trailer Number*</Label>
                <Input id="trailer_number" value={formData.trailer_number} onChange={e => setFormData({
                ...formData,
                trailer_number: e.target.value
              })} placeholder="TRL-001" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailer_type">Trailer Type</Label>
                <Select value={formData.trailer_type} onValueChange={value => setFormData({
                ...formData,
                trailer_type: value
              })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trailer type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dry Van">Dry Van</SelectItem>
                    <SelectItem value="Refrigerated">Refrigerated</SelectItem>
                    <SelectItem value="Flatbed">Flatbed</SelectItem>
                    <SelectItem value="Tank">Tank</SelectItem>
                    <SelectItem value="Container">Container</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="truck_id">Truck #</Label>
                <Select value={formData.truck_id} onValueChange={value => setFormData({
                ...formData,
                truck_id: value
              })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select truck" />
                  </SelectTrigger>
                  <SelectContent>
                    {truckOptions.map(truck => <SelectItem key={truck.value} value={truck.value}>
                        {truck.label}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

            <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Trailer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Trailer Inventory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input placeholder="Search trailers..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trailer #</TableHead>
                  <TableHead>Trailer Type</TableHead>
                  <TableHead>Connected Truck #</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrailers.length === 0 ? <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No trailers found
                    </TableCell>
                  </TableRow> : filteredTrailers.map(trailer => <TableRow key={trailer.id}>
                      <TableCell className="font-medium">{trailer.trailer_number}</TableCell>
                      <TableCell>{trailer.trailer_type || "—"}</TableCell>
                      <TableCell>
                        {trailer.trucks && trailer.trucks.length > 0 ? trailer.trucks[0].truck_number : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(trailer)}>
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
                                  This will permanently delete trailer {trailer.trailer_number}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTrailer(trailer.id)}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Trailer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditTrailer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_trailer_number">Trailer Number*</Label>
              <Input id="edit_trailer_number" value={formData.trailer_number} onChange={e => setFormData({
              ...formData,
              trailer_number: e.target.value
            })} placeholder="TRL-001" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_trailer_type">Trailer Type</Label>
              <Select value={formData.trailer_type} onValueChange={value => setFormData({
              ...formData,
              trailer_type: value
            })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trailer type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dry Van">Dry Van</SelectItem>
                  <SelectItem value="Refrigerated">Refrigerated</SelectItem>
                  <SelectItem value="Flatbed">Flatbed</SelectItem>
                  <SelectItem value="Tank">Tank</SelectItem>
                  <SelectItem value="Container">Container</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_truck_id">Truck #</Label>
              <Select value={formData.truck_id} onValueChange={value => setFormData({
              ...formData,
              truck_id: value
            })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select truck" />
                </SelectTrigger>
                <SelectContent>
                  {/* Include currently assigned truck + available trucks */}
                  {editingTrailer?.trucks?.[0] && <SelectItem value={editingTrailer.trucks[0].id}>
                      {editingTrailer.trucks[0].truck_number}
                    </SelectItem>}
                  {truckOptions.filter(truck => truck.value !== editingTrailer?.trucks?.[0]?.id).map(truck => <SelectItem key={truck.value} value={truck.value}>
                        {truck.label}
                      </SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Trailer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>;
};
export default Trailers;