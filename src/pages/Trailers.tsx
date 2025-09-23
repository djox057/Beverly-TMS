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
import { useToast } from "@/hooks/use-toast";

interface TrailerFormData {
  trailer_number: string;
  trailer_type: string;
  capacity: string;
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
    capacity: ""
  });

  const { toast } = useToast();
  const { data: trailers, isLoading, refetch } = useTrailers();

  // Filter trailers based on search term
  const filteredTrailers = trailers?.filter(trailer =>
    trailer.trailer_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trailer.trailer_type?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const resetForm = () => {
    setFormData({
      trailer_number: "",
      trailer_type: "",
      capacity: ""
    });
  };

  const handleAddTrailer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('trailers')
        .insert({
          trailer_number: formData.trailer_number,
          trailer_type: formData.trailer_type || null,
          capacity: formData.capacity ? parseInt(formData.capacity) : null
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Trailer added successfully",
      });

      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add trailer",
        variant: "destructive",
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
      const { error } = await supabase
        .from('trailers')
        .update({
          trailer_number: formData.trailer_number,
          trailer_type: formData.trailer_type || null,
          capacity: formData.capacity ? parseInt(formData.capacity) : null
        })
        .eq('id', editingTrailer.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Trailer updated successfully",
      });

      resetForm();
      setIsEditDialogOpen(false);
      setEditingTrailer(null);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update trailer",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTrailer = async (trailerId: string) => {
    try {
      const { error } = await supabase
        .from('trailers')
        .delete()
        .eq('id', trailerId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Trailer deleted successfully",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete trailer",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (trailer: any) => {
    setEditingTrailer(trailer);
    setFormData({
      trailer_number: trailer.trailer_number || "",
      trailer_type: trailer.trailer_type || "",
      capacity: trailer.capacity?.toString() || ""
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Trailers</h1>
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
                <Input
                  id="trailer_number"
                  value={formData.trailer_number}
                  onChange={(e) => setFormData({ ...formData, trailer_number: e.target.value })}
                  placeholder="TRL-001"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailer_type">Trailer Type</Label>
                <Select value={formData.trailer_type} onValueChange={(value) => setFormData({ ...formData, trailer_type: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trailer type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="Dry Van">Dry Van</SelectItem>
                    <SelectItem value="Refrigerated">Refrigerated</SelectItem>
                    <SelectItem value="Flatbed">Flatbed</SelectItem>
                    <SelectItem value="Tank">Tank</SelectItem>
                    <SelectItem value="Container">Container</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity (lbs)</Label>
                <Input
                  id="capacity"
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  placeholder="48000"
                />
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
              <Input
                placeholder="Search trailers..."
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
                  <TableHead>Trailer #</TableHead>
                  <TableHead>Trailer Type</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrailers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No trailers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTrailers.map((trailer) => (
                    <TableRow key={trailer.id}>
                      <TableCell className="font-medium">{trailer.trailer_number}</TableCell>
                      <TableCell>{trailer.trailer_type || "—"}</TableCell>
                      <TableCell>
                        {trailer.capacity ? `${trailer.capacity.toLocaleString()} lbs` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openEditDialog(trailer)}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Trailer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditTrailer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_trailer_number">Trailer Number*</Label>
              <Input
                id="edit_trailer_number"
                value={formData.trailer_number}
                onChange={(e) => setFormData({ ...formData, trailer_number: e.target.value })}
                placeholder="TRL-001"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_trailer_type">Trailer Type</Label>
              <Select value={formData.trailer_type} onValueChange={(value) => setFormData({ ...formData, trailer_type: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trailer type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  <SelectItem value="Dry Van">Dry Van</SelectItem>
                  <SelectItem value="Refrigerated">Refrigerated</SelectItem>
                  <SelectItem value="Flatbed">Flatbed</SelectItem>
                  <SelectItem value="Tank">Tank</SelectItem>
                  <SelectItem value="Container">Container</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_capacity">Capacity (lbs)</Label>
              <Input
                id="edit_capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                placeholder="48000"
              />
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
    </div>
  );
};

export default Trailers;