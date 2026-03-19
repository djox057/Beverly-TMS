import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { Search, Plus, Edit, Trash2, Loader2, History, Download, CheckCircle2, Play } from "lucide-react";
import * as XLSX from "xlsx";
import { useTrailers } from "@/hooks/useTrailers";
import { supabase } from "@/integrations/supabase/client";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAuthContext } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrailerFilesManager } from "@/components/TrailerFilesManager";
import { useQueryClient } from "@tanstack/react-query";
import { AssignmentHistoryDialog } from "@/components/AssignmentHistoryDialog";
import { Textarea } from "@/components/ui/textarea";

interface TrailerFormData {
  trailer_number: string;
  trailer_type: string;
  vin: string;
  plate: string;
  truck_id: string;
  dot_inspection_date: string;
  plate_expiration_date: string;
  insurance_expiration_date: string;
}

interface TerminationNote {
  id: string;
  note: string;
  created_at: string;
  created_by: string | null;
}

const Trailers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTrailer, setEditingTrailer] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyTrailerId, setHistoryTrailerId] = useState<string | null>(null);
  const [historyTrailerName, setHistoryTrailerName] = useState<string>("");
  const [showDoneConfirmation, setShowDoneConfirmation] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [terminationNote, setTerminationNote] = useState("");
  const [terminationNotes, setTerminationNotes] = useState<TerminationNote[]>([]);
  const [formData, setFormData] = useState<TrailerFormData>({
    trailer_number: "",
    trailer_type: "",
    vin: "",
    plate: "",
    truck_id: "",
    dot_inspection_date: "",
    plate_expiration_date: "",
    insurance_expiration_date: ""
  });

  const itemsPerPage = 100;
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasRole } = useAuthContext();
  const canDelete = hasRole('admin') || hasRole('manager') || hasRole('safety') || hasRole('maintenance');
  const queryClient = useQueryClient();
  const {
    data: trailers,
    isLoading,
    refetch
  } = useTrailers();
  
  // Force immediate refetch on mount to clear any stale cache
  useEffect(() => {
    // Clear old query cache if it exists
    queryClient.removeQueries({ queryKey: ['trailers'] });
    // Trigger a fresh fetch
    refetch();
  }, []); // Only on mount
  
  const {
    data: trucks
  } = useTrucks();
  const {
    data: drivers
  } = useDrivers();

  // Reset to first page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, assignmentFilter]);

  // Filter trailers based on search term, assignment status, and status filter
  const filteredTrailers = trailers?.filter(trailer => {
    // Search filter
    const matchesSearch = trailer.trailer_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
      trailer.trailer_type?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      trailer.vin?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (trailer.trucks && trailer.trucks.length > 0 && trailer.trucks[0].truck_number.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Assignment filter
    const isAssigned = trailer.trucks && trailer.trucks.length > 0;
    const matchesAssignment = assignmentFilter === "all" || 
      (assignmentFilter === "assigned" && isAssigned) || 
      (assignmentFilter === "unassigned" && !isAssigned);
    
    // Status filter
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && trailer.is_active !== false) || 
      (statusFilter === "inactive" && trailer.is_active === false);
    
    return matchesSearch && matchesAssignment && matchesStatus;
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredTrailers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTrailers = filteredTrailers.slice(startIndex, endIndex);

  // Generate empty rows to maintain consistent height
  const emptyRows = itemsPerPage - currentTrailers.length;
  const emptyRowsArray = Array.from({ length: Math.max(0, emptyRows) }, (_, i) => i);
  const resetForm = () => {
    setFormData({
      trailer_number: "",
      trailer_type: "",
      vin: "",
      plate: "",
      truck_id: "",
      dot_inspection_date: "",
      plate_expiration_date: "",
      insurance_expiration_date: ""
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
        trailer_number: formData.trailer_number?.trim(),
        trailer_type: formData.trailer_type || null,
        vin: formData.vin || null,
        plate: formData.plate || null,
        dot_inspection_date: formData.dot_inspection_date || null,
        plate_expiration_date: formData.plate_expiration_date || null,
        insurance_expiration_date: formData.insurance_expiration_date || null
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
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
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
        trailer_type: formData.trailer_type || null,
        vin: formData.vin || null,
        plate: formData.plate || null,
        dot_inspection_date: formData.dot_inspection_date || null,
        plate_expiration_date: formData.plate_expiration_date || null,
        insurance_expiration_date: formData.insurance_expiration_date || null
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
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
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
      // Get trailer data to save to history
      const { data: trailerData, error: fetchError } = await supabase
        .from('trailers')
        .select('*')
        .eq('id', trailerId)
        .single();
      
      if (fetchError) throw fetchError;

      // Save trailer number to orders before deletion (so it's preserved after trailer_id becomes NULL)
      await supabase
        .from('orders')
        .update({ deleted_trailer_number: trailerData.trailer_number })
        .eq('trailer_id', trailerId);

      // Save to deleted_trailers history table
      const { error: historyError } = await supabase
        .from('deleted_trailers')
        .insert({
          id: trailerData.id,
          trailer_number: trailerData.trailer_number,
          trailer_type: trailerData.trailer_type,
          vin: trailerData.vin,
          capacity: trailerData.capacity,
          dot_inspection_date: trailerData.dot_inspection_date,
          plate_expiration_date: trailerData.plate_expiration_date,
          insurance_expiration_date: trailerData.insurance_expiration_date,
          status: trailerData.status,
          deleted_by: user?.id
        });
      
      if (historyError) throw historyError;

      // Unassign from trucks
      await supabase
        .from('trucks')
        .update({ trailer_id: null })
        .eq('trailer_id', trailerId);

      // Nullify original_trailer_id references in orders
      await supabase
        .from('orders')
        .update({ original_trailer_id: null })
        .eq('original_trailer_id', trailerId);

      // Delete from trailers (orders.trailer_id becomes NULL via FK, but deleted_trailer_number is preserved)
      const { error } = await supabase.from('trailers').delete().eq('id', trailerId);
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Trailer deleted and archived successfully"
      });
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete trailer",
        variant: "destructive"
      });
    }
  };
  const openEditDialog = async (trailer: any) => {
    setEditingTrailer(trailer);
    setFormData({
      trailer_number: trailer.trailer_number || "",
      trailer_type: trailer.trailer_type || "",
      vin: trailer.vin || "",
      plate: trailer.plate || "",
      truck_id: trailer.trucks?.[0]?.id || "",
      dot_inspection_date: trailer.dot_inspection_date || "",
      plate_expiration_date: trailer.plate_expiration_date || "",
      insurance_expiration_date: trailer.insurance_expiration_date || ""
    });
    
    // Fetch termination notes if trailer is inactive
    if (trailer.is_active === false) {
      const { data: notes } = await supabase
        .from('trailer_termination_notes')
        .select('*')
        .eq('trailer_id', trailer.id)
        .order('created_at', { ascending: false });
      setTerminationNotes(notes || []);
    } else {
      setTerminationNotes([]);
    }
    
    setIsEditDialogOpen(true);
  };

  // Done functionality - mark trailer as inactive
  const handleDoneClick = () => {
    setShowDoneConfirmation(true);
  };

  const handleConfirmDone = () => {
    setShowDoneConfirmation(false);
    setShowNoteDialog(true);
  };

  const handleSaveTerminationNote = async () => {
    if (!editingTrailer || !terminationNote.trim()) return;
    
    setIsSubmitting(true);
    try {
      // Save termination note
      const { error: noteError } = await supabase
        .from('trailer_termination_notes')
        .insert({
          trailer_id: editingTrailer.id,
          note: terminationNote.trim(),
          created_by: user?.id
        });
      
      if (noteError) throw noteError;
      
      // Clear trailer from any trucks that have it assigned
      await supabase
        .from('trucks')
        .update({ trailer_id: null })
        .eq('trailer_id', editingTrailer.id);
      
      // Update trailer: set is_active = false, termination_date = today
      const { error: updateError } = await supabase
        .from('trailers')
        .update({
          is_active: false,
          termination_date: new Date().toISOString().split('T')[0]
        })
        .eq('id', editingTrailer.id);
      
      if (updateError) throw updateError;
      
      toast({
        title: "Success",
        description: `Trailer ${editingTrailer.trailer_number} marked as done`
      });
      
      setShowNoteDialog(false);
      setTerminationNote("");
      setIsEditDialogOpen(false);
      setEditingTrailer(null);
      
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to mark trailer as done",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start functionality - reactivate trailer
  const handleStartTrailer = async () => {
    if (!editingTrailer) return;
    
    setIsSubmitting(true);
    try {
      // Delete all termination notes
      await supabase
        .from('trailer_termination_notes')
        .delete()
        .eq('trailer_id', editingTrailer.id);
      
      // Update trailer: set is_active = true, clear termination_date
      const { error: updateError } = await supabase
        .from('trailers')
        .update({
          is_active: true,
          termination_date: null
        })
        .eq('id', editingTrailer.id);
      
      if (updateError) throw updateError;
      
      toast({
        title: "Success",
        description: `Trailer ${editingTrailer.trailer_number} reactivated`
      });
      
      setIsEditDialogOpen(false);
      setEditingTrailer(null);
      
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reactivate trailer",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredTrailers.map(trailer => ({
      "Trailer #": trailer.trailer_number,
      "Trailer Type": trailer.trailer_type || "",
      "VIN": trailer.vin || "",
      "Connected Truck #": trailer.trucks?.[0]?.truck_number || "",
      "DOT Inspection": trailer.dot_inspection_date || "",
      "Plate Exp.": trailer.plate_expiration_date || "",
      "Insurance Exp.": trailer.insurance_expiration_date || ""
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trailers");
    XLSX.writeFile(wb, `trailers_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast({
      title: "Export Complete",
      description: `Exported ${exportData.length} trailers to Excel`
    });
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
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
                <Label htmlFor="vin">VIN Number</Label>
                <Input id="vin" value={formData.vin} onChange={e => setFormData({
                ...formData,
                vin: e.target.value
              })} placeholder="Enter VIN" maxLength={17} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plate">Plate</Label>
                <Input id="plate" value={formData.plate} onChange={e => setFormData({
                ...formData,
                plate: e.target.value
              })} placeholder="Enter plate number" />
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

              <div className="space-y-2">
                <Label htmlFor="dot_inspection_date">DOT Inspection Date</Label>
                <Input 
                  id="dot_inspection_date" 
                  type="date" 
                  value={formData.dot_inspection_date} 
                  onChange={e => setFormData({
                    ...formData,
                    dot_inspection_date: e.target.value
                  })} 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plate_expiration_date">Plate Expiration Date</Label>
                <Input 
                  id="plate_expiration_date" 
                  type="date" 
                  value={formData.plate_expiration_date} 
                  onChange={e => setFormData({
                    ...formData,
                    plate_expiration_date: e.target.value
                  })} 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="insurance_expiration_date">Insurance Expiration Date</Label>
                <Input 
                  id="insurance_expiration_date" 
                  type="date" 
                  value={formData.insurance_expiration_date} 
                  onChange={e => setFormData({
                    ...formData,
                    insurance_expiration_date: e.target.value
                  })} 
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
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Trailer Inventory</CardTitle>
            <div className="flex items-center gap-3">
              <Select value={statusFilter} onValueChange={(value: "all" | "active" | "inactive") => setStatusFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All Status</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assignmentFilter} onValueChange={(value: "all" | "assigned" | "unassigned") => setAssignmentFilter(value)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Assignment status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trailers</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="Search trailers..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center w-[100px]">Trailer #</TableHead>
                  <TableHead className="text-center w-[120px]">Trailer Type</TableHead>
                  <TableHead className="text-center w-[180px]">VIN</TableHead>
                  <TableHead className="text-center w-[130px]">Connected Truck #</TableHead>
                  <TableHead className="text-center w-[120px]">DOT Inspection</TableHead>
                  <TableHead className="text-center w-[110px]">Plate Exp.</TableHead>
                  <TableHead className="text-center w-[120px]">Insurance Exp.</TableHead>
                  <TableHead className="text-center w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentTrailers.length === 0 ? <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No trailers found
                    </TableCell>
                  </TableRow> : <>
                    {currentTrailers.map(trailer => <TableRow key={trailer.id}>
                        <TableCell className="font-medium text-center whitespace-nowrap">{trailer.trailer_number}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{trailer.trailer_type || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{trailer.vin || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          {trailer.trucks && trailer.trucks.length > 0 ? trailer.trucks[0].truck_number : "—"}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">{trailer.dot_inspection_date || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{trailer.plate_expiration_date || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{trailer.insurance_expiration_date || "—"}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(trailer)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              setHistoryTrailerId(trailer.id);
                              setHistoryTrailerName(trailer.trailer_number);
                              setIsHistoryDialogOpen(true);
                            }}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {canDelete && (
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
                          )}
                        </div>
                      </TableCell>
                    </TableRow>)}
                    {emptyRowsArray.map((_, index) => (
                      <TableRow key={`empty-${index}`} className="h-[57px]">
                        <TableCell colSpan={8}>&nbsp;</TableCell>
                      </TableRow>
                    ))}
                  </>}
              </TableBody>
            </Table>
            
            {filteredTrailers.length > itemsPerPage && (
              <div className="flex items-center justify-between px-2 py-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredTrailers.length)} of {filteredTrailers.length} trailers
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    
                    {/* First page */}
                    {currentPage > 2 && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(1)} className="cursor-pointer">
                          1
                        </PaginationLink>
                      </PaginationItem>
                    )}
                    
                    {/* Ellipsis before current */}
                    {currentPage > 3 && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}
                    
                    {/* Previous page */}
                    {currentPage > 1 && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(currentPage - 1)} className="cursor-pointer">
                          {currentPage - 1}
                        </PaginationLink>
                      </PaginationItem>
                    )}
                    
                    {/* Current page */}
                    <PaginationItem>
                      <PaginationLink isActive className="cursor-default">
                        {currentPage}
                      </PaginationLink>
                    </PaginationItem>
                    
                    {/* Next page */}
                    {currentPage < totalPages && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(currentPage + 1)} className="cursor-pointer">
                          {currentPage + 1}
                        </PaginationLink>
                      </PaginationItem>
                    )}
                    
                    {/* Ellipsis after current */}
                    {currentPage < totalPages - 2 && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}
                    
                    {/* Last page */}
                    {currentPage < totalPages - 1 && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(totalPages)} className="cursor-pointer">
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    )}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Trailer</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Trailer Info</TabsTrigger>
              <TabsTrigger value="files">Trailer Files</TabsTrigger>
            </TabsList>
            
            <TabsContent value="info">
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
                  <Label htmlFor="edit_vin">VIN Number</Label>
                  <Input id="edit_vin" value={formData.vin} onChange={e => setFormData({
                  ...formData,
                  vin: e.target.value
                })} placeholder="Enter VIN" maxLength={17} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_plate">Plate</Label>
                  <Input id="edit_plate" value={formData.plate} onChange={e => setFormData({
                    ...formData,
                    plate: e.target.value
                  })} placeholder="Enter plate number" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_dot_inspection_date">DOT Inspection Date</Label>
                  <Input 
                    id="edit_dot_inspection_date" 
                    type="date" 
                    value={formData.dot_inspection_date} 
                    onChange={e => setFormData({
                      ...formData,
                      dot_inspection_date: e.target.value
                    })} 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_plate_expiration_date">Plate Expiration Date</Label>
                  <Input 
                    id="edit_plate_expiration_date" 
                    type="date" 
                    value={formData.plate_expiration_date} 
                    onChange={e => setFormData({
                      ...formData,
                      plate_expiration_date: e.target.value
                    })} 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_insurance_expiration_date">Insurance Expiration Date</Label>
                  <Input 
                    id="edit_insurance_expiration_date" 
                    type="date" 
                    value={formData.insurance_expiration_date} 
                    onChange={e => setFormData({
                      ...formData,
                      insurance_expiration_date: e.target.value
                    })} 
                  />
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

                {/* Termination notes section for inactive trailers */}
                {editingTrailer?.is_active === false && terminationNotes.length > 0 && (
                  <div className="space-y-2 p-3 bg-muted rounded-md">
                    <Label className="text-destructive font-semibold">Termination Notes</Label>
                    {terminationNotes.map((note) => (
                      <div key={note.id} className="text-sm text-muted-foreground">
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.created_at).toLocaleString()}
                        </span>
                        <p>{note.note}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between gap-3">
                  <div>
                    {canDelete && editingTrailer?.is_active !== false && (
                      <Button type="button" variant="destructive" onClick={handleDoneClick} disabled={isSubmitting}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Done
                      </Button>
                    )}
                    {canDelete && editingTrailer?.is_active === false && (
                      <Button type="button" variant="default" onClick={handleStartTrailer} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Play className="mr-2 h-4 w-4" />
                        Start
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update Trailer
                    </Button>
                  </div>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="files">
              {editingTrailer && (
                <TrailerFilesManager 
                  trailerId={editingTrailer.id} 
                  trailerNumber={editingTrailer.trailer_number}
                />
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Done Confirmation Dialog */}
      <AlertDialog open={showDoneConfirmation} onOpenChange={setShowDoneConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Trailer as Done?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark trailer {editingTrailer?.trailer_number} as inactive and remove it from any assigned trucks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDone}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Termination Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Termination Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Note for trailer {editingTrailer?.trailer_number}</Label>
              <Textarea
                value={terminationNote}
                onChange={(e) => setTerminationNote(e.target.value)}
                placeholder="Enter reason for marking this trailer as done..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTerminationNote} disabled={isSubmitting || !terminationNote.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Mark Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <AssignmentHistoryDialog
        entityType="trailer"
        entityId={historyTrailerId}
        entityName={historyTrailerName}
        open={isHistoryDialogOpen}
        onOpenChange={setIsHistoryDialogOpen}
      />
    </div>;
};
export default Trailers;