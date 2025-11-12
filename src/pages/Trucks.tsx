import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { Search, Plus, Edit, Trash2, Loader2, History } from "lucide-react";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useCompanies } from "@/hooks/useCompanies";
import { supabase } from "@/integrations/supabase/client";
import { useTrailers } from "@/hooks/useTrailers";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TruckFilesManager } from "@/components/TruckFilesManager";
import { useQueryClient } from "@tanstack/react-query";
import { AssignmentHistoryDialog } from "@/components/AssignmentHistoryDialog";
interface TruckFormData {
  truck_number: string;
  vin: string;
  trailer_id: string;
  driver_id: string;
  driver2_id: string;
  company_id: string;
  ipass: string;
  dot_inspection_date: string;
  plate_expiration_date: string;
  insurance_expiration_date: string;
}
const ITEMS_PER_PAGE = 8;

const Trucks = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyTruckId, setHistoryTruckId] = useState<string | null>(null);
  const [historyTruckName, setHistoryTruckName] = useState<string>("");
  const [formData, setFormData] = useState<TruckFormData>({
    truck_number: "",
    vin: "",
    trailer_id: "",
    driver_id: "",
    driver2_id: "",
    company_id: "",
    ipass: "",
    dot_inspection_date: "",
    plate_expiration_date: "",
    insurance_expiration_date: ""
  });
  const {
    toast
  } = useToast();
  const queryClient = useQueryClient();
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
  const filteredTrucks = trucks?.filter(truck => truck.truck_number.toLowerCase().includes(searchTerm.toLowerCase()) || truck.vin?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.dispatcher?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.dispatcher?.email?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.driver1?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.driver2?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.trailer?.trailer_number?.toLowerCase().includes(searchTerm.toLowerCase()) || truck.company?.name?.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  // Pagination
  const totalPages = Math.ceil(filteredTrucks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedTrucks = filteredTrucks.slice(startIndex, endIndex);

  // Reset to page 1 when search term changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };
  const resetForm = () => {
    setFormData({
      truck_number: "",
      vin: "",
      trailer_id: "",
      driver_id: "",
      driver2_id: "",
      company_id: "",
      ipass: "",
      dot_inspection_date: "",
      plate_expiration_date: "",
      insurance_expiration_date: ""
    });
  };
  const handleAddTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Remove driver from any other truck if already assigned
      if (formData.driver_id) {
        await supabase.from('trucks')
          .update({ driver1_id: null })
          .eq('driver1_id', formData.driver_id);
        await supabase.from('trucks')
          .update({ driver2_id: null })
          .eq('driver2_id', formData.driver_id);
      }
      if (formData.driver2_id) {
        await supabase.from('trucks')
          .update({ driver1_id: null })
          .eq('driver1_id', formData.driver2_id);
        await supabase.from('trucks')
          .update({ driver2_id: null })
          .eq('driver2_id', formData.driver2_id);
      }
      
      // Remove trailer from any other truck if already assigned
      if (formData.trailer_id) {
        await supabase.from('trucks')
          .update({ trailer_id: null })
          .eq('trailer_id', formData.trailer_id);
      }

      const {
        error
      } = await supabase.from('trucks').insert({
        truck_number: formData.truck_number,
        vin: formData.vin || null,
        trailer_id: formData.trailer_id || null,
        driver1_id: formData.driver_id || null,
        driver2_id: formData.driver2_id || null,
        company_id: formData.company_id || null,
        ipass: formData.ipass || null,
        dot_inspection_date: formData.dot_inspection_date || null,
        plate_expiration_date: formData.plate_expiration_date || null,
        insurance_expiration_date: formData.insurance_expiration_date || null
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Truck added successfully"
      });
      resetForm();
      setIsAddDialogOpen(false);
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
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
      // Remove driver from any other truck if already assigned (excluding current truck)
      if (formData.driver_id) {
        await supabase.from('trucks')
          .update({ driver1_id: null })
          .eq('driver1_id', formData.driver_id)
          .neq('id', editingTruck.id);
        await supabase.from('trucks')
          .update({ driver2_id: null })
          .eq('driver2_id', formData.driver_id)
          .neq('id', editingTruck.id);
      }
      if (formData.driver2_id) {
        await supabase.from('trucks')
          .update({ driver1_id: null })
          .eq('driver1_id', formData.driver2_id)
          .neq('id', editingTruck.id);
        await supabase.from('trucks')
          .update({ driver2_id: null })
          .eq('driver2_id', formData.driver2_id)
          .neq('id', editingTruck.id);
      }
      
      // Remove trailer from any other truck if already assigned (excluding current truck)
      if (formData.trailer_id) {
        await supabase.from('trucks')
          .update({ trailer_id: null })
          .eq('trailer_id', formData.trailer_id)
          .neq('id', editingTruck.id);
      }

      const {
        error
      } = await supabase.from('trucks').update({
        truck_number: formData.truck_number,
        vin: formData.vin || null,
        trailer_id: formData.trailer_id || null,
        driver1_id: formData.driver_id || null,
        driver2_id: formData.driver2_id || null,
        company_id: formData.company_id || null,
        ipass: formData.ipass || null,
        dot_inspection_date: formData.dot_inspection_date || null,
        plate_expiration_date: formData.plate_expiration_date || null,
        insurance_expiration_date: formData.insurance_expiration_date || null
      }).eq('id', editingTruck.id);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Truck updated successfully"
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingTruck(null);
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
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
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
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
      vin: truck.vin || "",
      trailer_id: truck.trailer_id || "",
      driver_id: truck.driver1_id || "",
      driver2_id: truck.driver2_id || "",
      company_id: truck.company_id || "",
      ipass: truck.ipass || "",
      dot_inspection_date: truck.dot_inspection_date || "",
      plate_expiration_date: truck.plate_expiration_date || "",
      insurance_expiration_date: truck.insurance_expiration_date || ""
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

  // Show all drivers (allow reassigning from other trucks)
  const driverOptions = drivers?.map(driver => ({
    value: driver.id,
    label: driver.name
  })) || [];
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
                  <Label htmlFor="vin">VIN Number</Label>
                  <Input id="vin" value={formData.vin} onChange={e => setFormData({
                  ...formData,
                  vin: e.target.value
                })} placeholder="1HGBH41JXMN109186" maxLength={17} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company_id">Company</Label>
                  <Combobox
                    options={companyOptions}
                    value={formData.company_id}
                    onValueChange={value => setFormData({
                      ...formData,
                      company_id: value
                    })}
                    placeholder="Select company"
                    searchPlaceholder="Search companies..."
                    emptyText="No company found."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driver_id">Driver 1</Label>
                  <Combobox
                    options={driverOptions}
                    value={formData.driver_id}
                    onValueChange={value => setFormData({
                      ...formData,
                      driver_id: value
                    })}
                    placeholder="Select driver 1"
                    searchPlaceholder="Search drivers..."
                    emptyText="No driver found."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driver2_id">Driver 2</Label>
                  <Combobox
                    options={driverOptions}
                    value={formData.driver2_id}
                    onValueChange={value => setFormData({
                      ...formData,
                      driver2_id: value
                    })}
                    placeholder="Select driver 2"
                    searchPlaceholder="Search drivers..."
                    emptyText="No driver found."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trailer_id">Trailer Number</Label>
                  <Combobox
                    options={trailerOptions}
                    value={formData.trailer_id}
                    onValueChange={value => setFormData({
                      ...formData,
                      trailer_id: value
                    })}
                    placeholder="Select trailer"
                    searchPlaceholder="Search trailers..."
                    emptyText="No trailer found."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ipass">IPASS</Label>
                  <Input id="ipass" value={formData.ipass} onChange={e => setFormData({
                  ...formData,
                  ipass: e.target.value
                })} placeholder="IPASS Number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dot_inspection_date">DOT Inspection Date</Label>
                  <Input id="dot_inspection_date" type="date" value={formData.dot_inspection_date} onChange={e => setFormData({
                  ...formData,
                  dot_inspection_date: e.target.value
                })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plate_expiration_date">Plate Expiration Date</Label>
                  <Input id="plate_expiration_date" type="date" value={formData.plate_expiration_date} onChange={e => setFormData({
                  ...formData,
                  plate_expiration_date: e.target.value
                })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_expiration_date">Insurance Expiration Date</Label>
                  <Input id="insurance_expiration_date" type="date" value={formData.insurance_expiration_date} onChange={e => setFormData({
                  ...formData,
                  insurance_expiration_date: e.target.value
                })} />
                </div>
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
              <Input placeholder="Search trucks..." className="pl-10" value={searchTerm} onChange={e => handleSearchChange(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col h-[700px]">
          <div className="overflow-x-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Truck #</TableHead>
                  <TableHead className="text-center">VIN</TableHead>
                  <TableHead className="text-center">Company</TableHead>
                  <TableHead className="text-center">Trailer #</TableHead>
                  <TableHead className="text-center">Driver 1</TableHead>
                  <TableHead className="text-center">Driver 2</TableHead>
                  <TableHead className="text-center">Dispatcher</TableHead>
                  <TableHead className="text-center">IPASS</TableHead>
                  <TableHead className="text-center">DOT Inspection</TableHead>
                  <TableHead className="text-center">Plate Exp.</TableHead>
                  <TableHead className="text-center">Insurance Exp.</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {paginatedTrucks.length === 0 ? <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      No trucks found
                    </TableCell>
                  </TableRow> : (
                    <>
                      {paginatedTrucks.map(truck => <TableRow key={truck.id}>
                        <TableCell className="font-medium text-center">{truck.truck_number}</TableCell>
                        <TableCell className="font-mono text-sm text-center">{truck.vin || "—"}</TableCell>
                        <TableCell className="text-center">{truck.company?.name || "—"}</TableCell>
                        <TableCell className="text-center">{truck.trailer?.trailer_number || "—"}</TableCell>
                        <TableCell className="text-center">{truck.driver1?.name || "—"}</TableCell>
                        <TableCell className="text-center">{truck.driver2?.name || "—"}</TableCell>
                        <TableCell className="text-center">{truck.dispatcher?.full_name || truck.dispatcher?.email || "—"}</TableCell>
                        <TableCell className="text-center">{truck.ipass || "—"}</TableCell>
                        <TableCell className="text-center">{truck.dot_inspection_date || "—"}</TableCell>
                        <TableCell className="text-center">{truck.plate_expiration_date || "—"}</TableCell>
                        <TableCell className="text-center">{truck.insurance_expiration_date || "—"}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(truck)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                setHistoryTruckId(truck.id);
                                setHistoryTruckName(truck.truck_number);
                                setIsHistoryDialogOpen(true);
                              }}
                            >
                              <History className="h-4 w-4" />
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
                      {/* Add empty rows to maintain consistent height */}
                      {Array.from({ length: ITEMS_PER_PAGE - paginatedTrucks.length }).map((_, index) => (
                        <TableRow key={`empty-${index}`}>
                          <TableCell colSpan={12} className="h-[57px]">&nbsp;</TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
              </TableBody>
            </Table>
          </div>
          {filteredTrucks.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between px-2 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredTrucks.length)} of {filteredTrucks.length} trucks
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
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Truck</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Truck Info</TabsTrigger>
              <TabsTrigger value="files">Truck Files</TabsTrigger>
            </TabsList>
            
            <TabsContent value="info">
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
                    <Label htmlFor="edit_vin">VIN Number</Label>
                    <Input id="edit_vin" value={formData.vin} onChange={e => setFormData({
                    ...formData,
                    vin: e.target.value
                  })} placeholder="1HGBH41JXMN109186" maxLength={17} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_company_id">Company</Label>
                    <Combobox
                      options={companyOptions}
                      value={formData.company_id}
                      onValueChange={value => setFormData({
                        ...formData,
                        company_id: value
                      })}
                      placeholder="Select company"
                      searchPlaceholder="Search companies..."
                      emptyText="No company found."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_driver_id">Driver 1</Label>
                    <Combobox
                      options={driverOptions}
                      value={formData.driver_id}
                      onValueChange={value => setFormData({
                        ...formData,
                        driver_id: value
                      })}
                      placeholder="Select driver 1"
                      searchPlaceholder="Search drivers..."
                      emptyText="No driver found."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_driver2_id">Driver 2</Label>
                    <Combobox
                      options={driverOptions}
                      value={formData.driver2_id}
                      onValueChange={value => setFormData({
                        ...formData,
                        driver2_id: value
                      })}
                      placeholder="Select driver 2"
                      searchPlaceholder="Search drivers..."
                      emptyText="No driver found."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_trailer_id">Trailer Number</Label>
                    <Combobox
                      options={trailerOptions}
                      value={formData.trailer_id}
                      onValueChange={value => setFormData({
                        ...formData,
                        trailer_id: value
                      })}
                      placeholder="Select trailer"
                      searchPlaceholder="Search trailers..."
                      emptyText="No trailer found."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_ipass">IPASS</Label>
                    <Input id="edit_ipass" value={formData.ipass} onChange={e => setFormData({
                    ...formData,
                    ipass: e.target.value
                  })} placeholder="IPASS Number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_dot_inspection_date">DOT Inspection Date</Label>
                    <Input id="edit_dot_inspection_date" type="date" value={formData.dot_inspection_date} onChange={e => setFormData({
                    ...formData,
                    dot_inspection_date: e.target.value
                  })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_plate_expiration_date">Plate Expiration Date</Label>
                    <Input id="edit_plate_expiration_date" type="date" value={formData.plate_expiration_date} onChange={e => setFormData({
                    ...formData,
                    plate_expiration_date: e.target.value
                  })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_insurance_expiration_date">Insurance Expiration Date</Label>
                    <Input id="edit_insurance_expiration_date" type="date" value={formData.insurance_expiration_date} onChange={e => setFormData({
                    ...formData,
                    insurance_expiration_date: e.target.value
                  })} />
                  </div>
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
            </TabsContent>
            
            <TabsContent value="files">
              {editingTruck && (
                <TruckFilesManager 
                  truckId={editingTruck.id} 
                  truckNumber={editingTruck.truck_number}
                />
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <AssignmentHistoryDialog
        entityType="truck"
        entityId={historyTruckId}
        entityName={historyTruckName}
        open={isHistoryDialogOpen}
        onOpenChange={setIsHistoryDialogOpen}
      />
    </div>;
};
export default Trucks;