import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, Edit, Phone, Mail, Trash2, Loader2, CheckCircle2, Play } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { useDrivers } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriverFilesManager } from "@/components/DriverFilesManager";
import { useDriverSensitivePII } from "@/hooks/useDriverSensitivePII";
import { useAuthContext } from "@/contexts/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDriverDrugTests } from "@/hooks/useDriverDrugTests";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
interface DriverFormData {
  name: string;
  phone: string;
  email: string;
  truck_id: string;
  trailer_id: string;
  dispatcher_id: string;
  home_address: string;
  home_city: string;
  home_state: string;
  home_latitude: string;
  home_longitude: string;
  personal_id: string;
  fuel_card_number: string;
  cdl_number: string;
  cdl_expiration_date: string;
  medical_card_expiration_date: string;
  hire_date: string;
  termination_date: string;
  mvr_date: string;
  clearing_house: string;
  ssn: string;
  fein: string;
  drugTestResult: "positive" | "negative" | "pending" | null;
}
const Drivers = () => {
  const {
    hasRole
  } = useAuthContext();
  const canViewSensitiveData = hasRole('manager') || hasRole('admin') || hasRole('accounting');
  const {
    upsertDrugTest
  } = useDriverDrugTests();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");
  const [showDoneConfirmation, setShowDoneConfirmation] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [terminationNote, setTerminationNote] = useState("");
  const itemsPerPage = 8;
  const [formData, setFormData] = useState<DriverFormData>({
    name: "",
    phone: "",
    email: "",
    truck_id: "",
    trailer_id: "",
    dispatcher_id: "",
    home_address: "",
    home_city: "",
    home_state: "",
    home_latitude: "",
    home_longitude: "",
    personal_id: "",
    fuel_card_number: "",
    cdl_number: "",
    cdl_expiration_date: "",
    medical_card_expiration_date: "",
    hire_date: "",
    termination_date: "",
    mvr_date: "",
    clearing_house: "",
    ssn: "",
    fein: "",
    drugTestResult: null
  });
  const {
    toast
  } = useToast();
  const {
    data: drivers,
    isLoading,
    refetch
  } = useDrivers();
  const {
    data: allTrucks
  } = useAvailableTrucks();
  const {
    data: availableTrailers
  } = useAvailableTrailers(selectedTruckId || formData.truck_id);
  const {
    data: sensitivePII,
    refetch: refetchSensitivePII
  } = useDriverSensitivePII(editingDriver?.id);
  const {
    allDispatchers
  } = useFleetManagement();

  // Fetch termination notes for the editing driver
  const [terminationNotes, setTerminationNotes] = useState<any[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  // Fetch termination notes when dialog opens
  const fetchTerminationNotes = async (driverId: string) => {
    setIsLoadingNotes(true);
    try {
      const {
        data,
        error
      } = await supabase.from('driver_termination_notes').select('*').eq('driver_id', driverId).order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setTerminationNotes(data || []);
    } catch (error) {
      console.error('Error fetching termination notes:', error);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  // Filter drivers based on search term
  const filteredDrivers = drivers?.filter((driver: any) => driver.name.toLowerCase().includes(searchTerm.toLowerCase()) || driver.phone?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.home_city?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.home_state?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.truck_info?.truck_number?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.truck_info?.trailer_number?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.dispatcher_info?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.dispatcher_info?.email?.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  // Pagination
  const totalPages = Math.ceil(filteredDrivers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDrivers = filteredDrivers.slice(startIndex, endIndex);

  // Reset to first page when search term changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };
  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      truck_id: "",
      trailer_id: "",
      dispatcher_id: "",
      home_address: "",
      home_city: "",
      home_state: "",
      home_latitude: "",
      home_longitude: "",
      personal_id: "",
      fuel_card_number: "",
      cdl_number: "",
      cdl_expiration_date: "",
      medical_card_expiration_date: "",
      hire_date: "",
      termination_date: "",
      mvr_date: "",
      clearing_house: "",
      ssn: "",
      fein: "",
      drugTestResult: null
    });
    setSelectedTruckId("");
  };
  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Create driver record including home address
      const {
        data: driverData,
        error
      } = await supabase.from('drivers').insert({
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        dispatcher_id: formData.dispatcher_id || null,
        home_address: formData.home_address || null,
        home_city: formData.home_city || null,
        home_state: formData.home_state || null,
        home_latitude: formData.home_latitude ? parseFloat(formData.home_latitude) : null,
        home_longitude: formData.home_longitude ? parseFloat(formData.home_longitude) : null,
        cdl_number: formData.cdl_number || null,
        cdl_expiration_date: formData.cdl_expiration_date || null,
        medical_card_expiration_date: formData.medical_card_expiration_date || null,
        hire_date: formData.hire_date || null,
        termination_date: formData.termination_date || null,
        mvr_date: formData.mvr_date || null,
        clearing_house: formData.clearing_house || null,
        license_number: formData.cdl_number || null
      }).select().single();
      if (error) throw error;

      // Insert sensitive PII if user has permission (managers/admins only)
      if (canViewSensitiveData && driverData) {
        const {
          error: piiError
        } = await supabase.from('driver_sensitive_pii').insert({
          driver_id: driverData.id,
          ssn: formData.ssn || null,
          fein: formData.fein || null,
          fuel_card_number: formData.fuel_card_number || null,
          personal_id: formData.personal_id || null
        });
        if (piiError) throw piiError;
      }

      // Update truck if selected
      if (formData.truck_id && driverData) {
        const {
          error: truckError
        } = await supabase.from('trucks').update({
          driver1_id: driverData.id,
          trailer_id: formData.trailer_id || null
        }).eq('id', formData.truck_id);
        if (truckError) throw truckError;
      }

      // Add drug test result if provided
      if (formData.drugTestResult && driverData) {
        await upsertDrugTest.mutateAsync({
          driverId: driverData.id,
          result: formData.drugTestResult,
          truckId: formData.truck_id
        });
      }
      toast({
        title: "Success",
        description: "Driver added successfully"
      });
      resetForm();
      setIsAddDialogOpen(false);
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
    } catch (error: any) {
      let errorMessage = error.message || "Failed to add driver";

      // Check for duplicate email error
      if (error.message?.includes('duplicate key value') && error.message?.includes('drivers_email_key')) {
        errorMessage = "A driver with this email already exists. Please use a different email or update the existing driver.";
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleEditDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    setIsSubmitting(true);
    try {
      // Update driver record including home address
      const {
        error
      } = await supabase.from('drivers').update({
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        dispatcher_id: formData.dispatcher_id || null,
        home_address: formData.home_address || null,
        home_city: formData.home_city || null,
        home_state: formData.home_state || null,
        home_latitude: formData.home_latitude ? parseFloat(formData.home_latitude) : null,
        home_longitude: formData.home_longitude ? parseFloat(formData.home_longitude) : null,
        cdl_number: formData.cdl_number || null,
        cdl_expiration_date: formData.cdl_expiration_date || null,
        medical_card_expiration_date: formData.medical_card_expiration_date || null,
        hire_date: formData.hire_date || null,
        termination_date: formData.termination_date || null,
        mvr_date: formData.mvr_date || null,
        clearing_house: formData.clearing_house || null,
        license_number: formData.cdl_number || null
      }).eq('id', editingDriver.id);
      if (error) throw error;

      // Update sensitive PII if user has permission (managers/admins only)
      if (canViewSensitiveData) {
        const {
          error: piiError
        } = await supabase.from('driver_sensitive_pii').upsert({
          driver_id: editingDriver.id,
          ssn: formData.ssn || null,
          fein: formData.fein || null,
          fuel_card_number: formData.fuel_card_number || null,
          personal_id: formData.personal_id || null
        }, {
          onConflict: 'driver_id'
        });
        if (piiError) throw piiError;
      }

      // Update truck if selected
      if (formData.truck_id) {
        const {
          error: truckError
        } = await supabase.from('trucks').update({
          driver1_id: editingDriver.id,
          trailer_id: formData.trailer_id || null
        }).eq('id', formData.truck_id);
        if (truckError) throw truckError;
      }
      toast({
        title: "Success",
        description: "Driver updated successfully"
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
    } catch (error: any) {
      let errorMessage = error.message || "Failed to update driver";

      // Check for duplicate email error
      if (error.message?.includes('duplicate key value') && error.message?.includes('drivers_email_key')) {
        errorMessage = "A driver with this email already exists. Please use a different email.";
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDoneClick = () => {
    setShowDoneConfirmation(true);
  };
  const handleConfirmDone = () => {
    setShowDoneConfirmation(false);
    setShowNoteDialog(true);
  };
  const handleSaveTerminationNote = async () => {
    if (!editingDriver || !terminationNote.trim()) {
      toast({
        title: "Error",
        description: "Please enter a note",
        variant: "destructive"
      });
      return;
    }
    setIsSubmitting(true);
    try {
      // Save termination note
      const {
        error: noteError
      } = await supabase.from('driver_termination_notes').insert({
        driver_id: editingDriver.id,
        note: terminationNote.trim(),
        created_by: (await supabase.auth.getUser()).data.user?.id
      });
      if (noteError) throw noteError;

      // Set termination date, mark as inactive, and clear dispatcher
      const {
        error: driverError
      } = await supabase.from('drivers').update({
        is_active: false,
        termination_date: new Date().toISOString().split('T')[0],
        dispatcher_id: null
      }).eq('id', editingDriver.id);
      if (driverError) throw driverError;

      // Find and disconnect truck/trailer
      const {
        data: truck,
        error: truckFindError
      } = await supabase.from('trucks').select('id, driver1_id, driver2_id, company_id').or(`driver1_id.eq.${editingDriver.id},driver2_id.eq.${editingDriver.id}`).maybeSingle();
      if (truckFindError) throw truckFindError;
      if (truck) {
        // Determine which driver field to clear
        const updateData: any = {
          trailer_id: null
        };
        if (truck.driver1_id === editingDriver.id) {
          updateData.driver1_id = null;
        }
        if (truck.driver2_id === editingDriver.id) {
          updateData.driver2_id = null;
        }
        const {
          error: truckUpdateError
        } = await supabase.from('trucks').update(updateData).eq('id', truck.id);
        if (truckUpdateError) throw truckUpdateError;
      }
      toast({
        title: "Success",
        description: `${formData.name} has been marked as done and removed from active drivers`
      });
      setTerminationNote("");
      setShowNoteDialog(false);
      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      refetch();
      
      // Invalidate reports cache so Reports page updates immediately
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      
      fetchTerminationNotes(editingDriver.id);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to mark driver as done",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleStartDriver = async () => {
    if (!editingDriver) return;
    setIsSubmitting(true);
    try {
      // Delete all termination notes for this driver
      const {
        error: deleteError
      } = await supabase.from('driver_termination_notes').delete().eq('driver_id', editingDriver.id);
      if (deleteError) throw deleteError;

      // Reactivate driver and clear termination date
      const {
        error: driverError
      } = await supabase.from('drivers').update({
        is_active: true,
        termination_date: null
      }).eq('id', editingDriver.id);
      if (driverError) throw driverError;
      toast({
        title: "Success",
        description: `${formData.name} has been reactivated`
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reactivate driver",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleTwoWeekBlock = async () => {
    if (!editingDriver) return;

    // Check if already blocked
    if (editingDriver.two_week_block_date) {
      // Show cancel confirmation
      if (!confirm("Do you want to cancel the 2-week block?")) {
        return;
      }
      setIsSubmitting(true);
      try {
        // Remove the block date
        const {
          error
        } = await supabase.from('drivers').update({
          two_week_block_date: null
        }).eq('id', editingDriver.id);
        if (error) throw error;

        // Delete the GAME-OVER order if it exists
        await supabase.from('orders').delete().eq('driver1_id', editingDriver.id).eq('load_number', 'GAME-OVER');
        toast({
          title: "Success",
          description: "2-week block cancelled"
        });
        setIsEditDialogOpen(false);
        setEditingDriver(null);
        resetForm();
        refetch();
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to cancel 2-week block",
          variant: "destructive"
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    setIsSubmitting(true);
    try {
      // Set the block date (14 days from today)
      const today = new Date();
      const blockDate = new Date(today.setDate(today.getDate() + 14)).toISOString().split('T')[0];
      const {
        error: blockError
      } = await supabase.from('drivers').update({
        two_week_block_date: blockDate
      }).eq('id', editingDriver.id);
      if (blockError) throw blockError;
      toast({
        title: "Success",
        description: "2-week block created successfully"
      });
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      resetForm();
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create 2-week block",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteDriver = async (driverId: string) => {
    try {
      const {
        error
      } = await supabase.from('drivers').delete().eq('id', driverId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Driver deleted successfully"
      });
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete driver",
        variant: "destructive"
      });
    }
  };
  const openEditDialog = async (driver: any) => {
    setEditingDriver(driver);
    fetchTerminationNotes(driver.id);

    // Get current truck assignment
    const {
      data: truckData
    } = await supabase.from('trucks').select('id, trailer_id').or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id}`).maybeSingle();

    // Fetch sensitive PII if user has permission
    let sensitivePIIData = null;
    if (canViewSensitiveData) {
      const {
        data
      } = await supabase.from('driver_sensitive_pii').select('*').eq('driver_id', driver.id).maybeSingle();
      sensitivePIIData = data;
    }
    setFormData({
      name: driver.name || "",
      phone: driver.phone || "",
      email: driver.email || "",
      truck_id: truckData?.id || "",
      trailer_id: truckData?.trailer_id || "",
      dispatcher_id: driver.dispatcher_id || "",
      home_address: driver.home_address || "",
      home_city: driver.home_city || "",
      home_state: driver.home_state || "",
      home_latitude: driver.home_latitude?.toString() || "",
      home_longitude: driver.home_longitude?.toString() || "",
      personal_id: sensitivePIIData?.personal_id || "",
      fuel_card_number: sensitivePIIData?.fuel_card_number || "",
      cdl_number: driver.cdl_number || "",
      cdl_expiration_date: driver.cdl_expiration_date || "",
      medical_card_expiration_date: driver.medical_card_expiration_date || "",
      hire_date: driver.hire_date || "",
      termination_date: driver.termination_date || "",
      mvr_date: driver.mvr_date || "",
      clearing_house: driver.clearing_house || "",
      ssn: sensitivePIIData?.ssn || "",
      fein: sensitivePIIData?.fein || "",
      drugTestResult: null
    });
    if (truckData?.id) {
      setSelectedTruckId(truckData.id);
    }
    setIsEditDialogOpen(true);
  };
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>;
  }

  // Get the truck ID for the driver being edited
  const editingDriverTruckId = editingDriver ? 
    allTrucks?.find(truck => truck.driver1_id === editingDriver.id)?.id : null;

  // Filter out trucks that are already assigned to other drivers
  const availableTrucks = allTrucks?.filter(truck => {
    // If we're editing a driver, allow their currently assigned truck to remain in the list
    if (editingDriver && truck.id === editingDriverTruckId) {
      return true;
    }
    // Truck is available if it has no driver assigned
    return !truck.driver1_id;
  }) || [];

  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground px-[10px]">Drivers</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Add Driver
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Add New Driver</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddDriver} className="space-y-4">
              <ScrollArea className="h-[calc(90vh-180px)] pr-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="space-y-2 col-span-3">
                  <Label htmlFor="name">Name*</Label>
                  <Input id="name" value={formData.name} onChange={e => setFormData({
                  ...formData,
                  name: e.target.value
                })} placeholder="John Smith" required />
                </div>
                <div className="space-y-2 col-span-3">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={formData.phone} onChange={e => setFormData({
                  ...formData,
                  phone: e.target.value
                })} placeholder="(555) 123-4567" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email} onChange={e => setFormData({
                  ...formData,
                  email: e.target.value
                })} placeholder="john.smith@company.com" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="truck">Truck Number</Label>
                  <Combobox options={(availableTrucks || []).map(truck => ({
                  value: truck.id,
                  label: truck.truck_number
                }))} value={formData.truck_id} onValueChange={value => {
                  const selectedTruck = availableTrucks?.find(truck => truck.id === value);
                  setFormData({
                    ...formData,
                    truck_id: value,
                    trailer_id: selectedTruck?.trailer_id || ""
                  });
                  setSelectedTruckId(value);
                }} placeholder="Select truck..." emptyText="No available trucks" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trailer">Trailer Number</Label>
                  <Combobox options={(availableTrailers || []).map(trailer => ({
                  value: trailer.id,
                  label: trailer.trailer_number
                }))} value={formData.trailer_id} onValueChange={value => setFormData({
                  ...formData,
                  trailer_id: value
                })} placeholder={formData.truck_id ? "Select trailer..." : "Select truck first"} emptyText="No available trailers" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dispatcher">Dispatcher</Label>
                <Combobox
                  options={allDispatchers.map(d => ({ value: d.id, label: d.full_name || d.email }))}
                  value={formData.dispatcher_id}
                  onValueChange={value => setFormData({ ...formData, dispatcher_id: value })}
                  placeholder="Select dispatcher..."
                  emptyText="No dispatchers found"
                />
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="space-y-2 col-span-7">
                  <Label htmlFor="home_address">Home Address</Label>
                  <Input id="home_address" value={formData.home_address} onChange={e => setFormData({
                  ...formData,
                  home_address: e.target.value
                })} placeholder="1234 Oak Street" />
                </div>
                <div className="space-y-2 col-span-3">
                  <Label htmlFor="home_city">Home City</Label>
                  <Input id="home_city" value={formData.home_city} onChange={e => setFormData({
                  ...formData,
                  home_city: e.target.value
                })} placeholder="Chicago" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="home_state">Home State</Label>
                  <Input id="home_state" value={formData.home_state} onChange={e => setFormData({
                  ...formData,
                  home_state: e.target.value
                })} placeholder="IL" />
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="personal_id">Personal ID</Label>
                    <Input id="personal_id" value={formData.personal_id} onChange={e => setFormData({
                    ...formData,
                    personal_id: e.target.value
                  })} placeholder="Personal ID" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fuel_card_number">Fuel Card #</Label>
                    <Input id="fuel_card_number" value={formData.fuel_card_number} onChange={e => setFormData({
                    ...formData,
                    fuel_card_number: e.target.value
                  })} placeholder="Fuel Card Number" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cdl_number">CDL Number</Label>
                    <Input id="cdl_number" value={formData.cdl_number} onChange={e => setFormData({
                    ...formData,
                    cdl_number: e.target.value
                  })} placeholder="CDL Number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cdl_expiration_date">CDL Expiration Date</Label>
                    <Input id="cdl_expiration_date" type="date" value={formData.cdl_expiration_date} onChange={e => setFormData({
                    ...formData,
                    cdl_expiration_date: e.target.value
                  })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hire_date">Hire Date</Label>
                    <Input id="hire_date" type="date" value={formData.hire_date} onChange={e => setFormData({
                    ...formData,
                    hire_date: e.target.value
                  })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termination_date">Termination Date</Label>
                    <Input id="termination_date" type="date" value={formData.termination_date} onChange={e => setFormData({
                    ...formData,
                    termination_date: e.target.value
                  })} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mvr_date">MVR Date</Label>
                    <Input id="mvr_date" type="date" value={formData.mvr_date} onChange={e => setFormData({
                    ...formData,
                    mvr_date: e.target.value
                  })} />
                  </div>
                  <div className="space-y-2">
                  <Label htmlFor="clearing_house">Clearing House</Label>
                  <Input id="clearing_house" type="date" value={formData.clearing_house} onChange={e => setFormData({
                    ...formData,
                    clearing_house: e.target.value
                  })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medical_card_expiration_date">Medical Card Exp</Label>
                    <Input id="medical_card_expiration_date" type="date" value={formData.medical_card_expiration_date} onChange={e => setFormData({
                    ...formData,
                    medical_card_expiration_date: e.target.value
                  })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ssn">SSN #</Label>
                    <Input id="ssn" value={formData.ssn} onChange={e => setFormData({
                    ...formData,
                    ssn: e.target.value
                  })} placeholder="SSN" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fein">FEIN #</Label>
                    <Input id="fein" value={formData.fein} onChange={e => setFormData({
                    ...formData,
                    fein: e.target.value
                  })} placeholder="FEIN" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="drugTestResult">Drug Test Result</Label>
                  <Select value={formData.drugTestResult || ""} onValueChange={value => setFormData({
                  ...formData,
                  drugTestResult: value as "positive" | "negative" | "pending" | null
                })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select drug test result..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                      <SelectItem value="positive">Positive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              </ScrollArea>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Driver
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Driver Directory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input placeholder="Search drivers..." className="pl-10" value={searchTerm} onChange={e => handleSearchChange(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto h-[700px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Trailer #</TableHead>
                  <TableHead>Dispatcher</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Home Location</TableHead>
                  
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDrivers.length === 0 ? <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No drivers found
                    </TableCell>
                  </TableRow> : paginatedDrivers.map((driver: any) => <TableRow key={driver.id} className={!driver.is_active ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {driver.name}
                          {!driver.is_active && <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                              Inactive
                            </span>}
                        </div>
                      </TableCell>
                      <TableCell>{driver.truck_info?.truck_number || "—"}</TableCell>
                      <TableCell>{driver.truck_info?.trailer_number || "—"}</TableCell>
                      <TableCell>{driver.dispatcher_info?.full_name || driver.dispatcher_info?.email || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {driver.phone && <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              {driver.phone}
                            </div>}
                          {driver.email && <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              {driver.email}
                            </div>}
                          {!driver.phone && !driver.email && "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {driver.home_city && driver.home_state ? `${driver.home_city}, ${driver.home_state}` : driver.home_city || driver.home_state || "—"}
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(driver)}>
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
                                  This will permanently delete driver {driver.name}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDriver(driver.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>)}
                {/* Empty rows to maintain consistent table height */}
                {paginatedDrivers.length > 0 && Array.from({
                length: itemsPerPage - paginatedDrivers.length
              }).map((_, index) => <TableRow key={`empty-${index}`} className="hover:bg-transparent">
                    <TableCell colSpan={7} className="h-[57px]">&nbsp;</TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination */}
          {filteredDrivers.length > itemsPerPage && <div className="flex items-center justify-between px-2 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredDrivers.length)} of {filteredDrivers.length} drivers
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                  </PaginationItem>
                  
                  {/* First page */}
                  {currentPage > 2 && <PaginationItem>
                      <PaginationLink onClick={() => setCurrentPage(1)} className="cursor-pointer">
                        1
                      </PaginationLink>
                    </PaginationItem>}
                  
                  {/* Ellipsis before current */}
                  {currentPage > 3 && <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>}
                  
                  {/* Previous page */}
                  {currentPage > 1 && <PaginationItem>
                      <PaginationLink onClick={() => setCurrentPage(currentPage - 1)} className="cursor-pointer">
                        {currentPage - 1}
                      </PaginationLink>
                    </PaginationItem>}
                  
                  {/* Current page */}
                  <PaginationItem>
                    <PaginationLink isActive className="cursor-default">
                      {currentPage}
                    </PaginationLink>
                  </PaginationItem>
                  
                  {/* Next page */}
                  {currentPage < totalPages && <PaginationItem>
                      <PaginationLink onClick={() => setCurrentPage(currentPage + 1)} className="cursor-pointer">
                        {currentPage + 1}
                      </PaginationLink>
                    </PaginationItem>}
                  
                  {/* Ellipsis after current */}
                  {currentPage < totalPages - 2 && <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>}
                  
                  {/* Last page */}
                  {currentPage < totalPages - 1 && <PaginationItem>
                      <PaginationLink onClick={() => setCurrentPage(totalPages)} className="cursor-pointer">
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>}
                  
                  <PaginationItem>
                    <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Driver</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Driver Info</TabsTrigger>
              <TabsTrigger value="files">Driver Files</TabsTrigger>
            </TabsList>
            
            <TabsContent value="info">
              <form onSubmit={handleEditDriver} className="space-y-4">
                <div className="grid grid-cols-12 gap-4">
                  <div className="space-y-2 col-span-3">
                    <Label htmlFor="edit_name">Name*</Label>
                    <Input id="edit_name" value={formData.name} onChange={e => setFormData({
                    ...formData,
                    name: e.target.value
                  })} placeholder="John Smith" required />
                  </div>
                  <div className="space-y-2 col-span-3">
                    <Label htmlFor="edit_phone">Phone</Label>
                    <Input id="edit_phone" value={formData.phone} onChange={e => setFormData({
                    ...formData,
                    phone: e.target.value
                  })} placeholder="(555) 123-4567" />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label htmlFor="edit_email">Email</Label>
                    <Input id="edit_email" type="email" value={formData.email} onChange={e => setFormData({
                    ...formData,
                    email: e.target.value
                  })} placeholder="john.smith@company.com" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_truck">Truck Number</Label>
                    <Combobox options={(availableTrucks || []).map(truck => ({
                    value: truck.id,
                    label: truck.truck_number
                  }))} value={formData.truck_id} onValueChange={value => {
                    const selectedTruck = availableTrucks?.find(truck => truck.id === value);
                    setFormData({
                      ...formData,
                      truck_id: value,
                      trailer_id: selectedTruck?.trailer_id || ""
                    });
                    setSelectedTruckId(value);
                  }} placeholder="Select truck..." emptyText="No available trucks" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_trailer">Trailer Number</Label>
                    <Combobox options={(availableTrailers || []).map(trailer => ({
                    value: trailer.id,
                    label: trailer.trailer_number
                  }))} value={formData.trailer_id} onValueChange={value => setFormData({
                    ...formData,
                    trailer_id: value
                  })} placeholder={formData.truck_id ? "Select trailer..." : "Select truck first"} emptyText="No available trailers" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_dispatcher">Dispatcher</Label>
                  <Combobox
                    options={allDispatchers.map(d => ({ value: d.id, label: d.full_name || d.email }))}
                    value={formData.dispatcher_id}
                    onValueChange={value => setFormData({ ...formData, dispatcher_id: value })}
                    placeholder="Select dispatcher..."
                    emptyText="No dispatchers found"
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="space-y-2 col-span-7">
                      <Label htmlFor="edit_home_address">Home Address</Label>
                      <Input id="edit_home_address" value={formData.home_address} onChange={e => setFormData({
                      ...formData,
                      home_address: e.target.value
                    })} placeholder="1234 Oak Street" />
                    </div>
                    <div className="space-y-2 col-span-3">
                      <Label htmlFor="edit_home_city">Home City</Label>
                      <Input id="edit_home_city" value={formData.home_city} onChange={e => setFormData({
                      ...formData,
                      home_city: e.target.value
                    })} placeholder="Chicago" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="edit_home_state">Home State</Label>
                      <Input id="edit_home_state" value={formData.home_state} onChange={e => setFormData({
                      ...formData,
                      home_state: e.target.value
                    })} placeholder="IL" />
                    </div>
                  </div>
                </div>

                {canViewSensitiveData && <>
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-4">
                        🔒 Sensitive Information (Managers/Admins Only)
                      </p>
                    </div>

                    <div className="space-y-4">
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit_personal_id">Personal ID</Label>
                          <Input id="edit_personal_id" value={formData.personal_id} onChange={e => setFormData({
                        ...formData,
                        personal_id: e.target.value
                      })} placeholder="Personal ID" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit_fuel_card_number">Fuel Card #</Label>
                          <Input id="edit_fuel_card_number" value={formData.fuel_card_number} onChange={e => setFormData({
                        ...formData,
                        fuel_card_number: e.target.value
                      })} placeholder="Fuel Card Number" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="space-y-2">
                          <Label htmlFor="edit_ssn">SSN #</Label>
                          <Input id="edit_ssn" value={formData.ssn} onChange={e => setFormData({
                        ...formData,
                        ssn: e.target.value
                      })} placeholder="SSN" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit_fein">FEIN #</Label>
                          <Input id="edit_fein" value={formData.fein} onChange={e => setFormData({
                        ...formData,
                        fein: e.target.value
                      })} placeholder="FEIN" />
                        </div>
                      </div>
                    </div>
                  </>}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_cdl_number">CDL Number</Label>
                      <Input id="edit_cdl_number" value={formData.cdl_number} onChange={e => setFormData({
                    ...formData,
                    cdl_number: e.target.value
                  })} placeholder="CDL Number" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_cdl_expiration_date">CDL Expiration Date</Label>
                      <Input id="edit_cdl_expiration_date" type="date" value={formData.cdl_expiration_date} onChange={e => setFormData({
                    ...formData,
                    cdl_expiration_date: e.target.value
                  })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_hire_date">Hire Date</Label>
                      <Input id="edit_hire_date" type="date" value={formData.hire_date} onChange={e => setFormData({
                    ...formData,
                    hire_date: e.target.value
                  })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_termination_date">Termination Date</Label>
                      <Input id="edit_termination_date" type="date" value={formData.termination_date} onChange={e => setFormData({
                    ...formData,
                    termination_date: e.target.value
                  })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_mvr_date">MVR Date</Label>
                      <Input id="edit_mvr_date" type="date" value={formData.mvr_date} onChange={e => setFormData({
                    ...formData,
                    mvr_date: e.target.value
                  })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_clearing_house">Clearing House</Label>
                      <Input id="edit_clearing_house" type="date" value={formData.clearing_house} onChange={e => setFormData({
                    ...formData,
                    clearing_house: e.target.value
                  })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_medical_card_expiration_date">Medical Card Exp</Label>
                      <Input id="edit_medical_card_expiration_date" type="date" value={formData.medical_card_expiration_date} onChange={e => setFormData({
                    ...formData,
                    medical_card_expiration_date: e.target.value
                  })} />
                    </div>
                  </div>

                  {canViewSensitiveData && <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div className="space-y-2">
                        <Label htmlFor="edit_ssn">SSN #</Label>
                        <Input id="edit_ssn" value={formData.ssn} onChange={e => setFormData({
                    ...formData,
                    ssn: e.target.value
                  })} placeholder="SSN" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit_fein">FEIN #</Label>
                        <Input id="edit_fein" value={formData.fein} onChange={e => setFormData({
                    ...formData,
                    fein: e.target.value
                  })} placeholder="FEIN" />
                      </div>
                    </div>}

                <div className="flex justify-between gap-3">
                  <div className="flex gap-3">
                    {!editingDriver?.is_active ? <Button type="button" variant="default" onClick={handleStartDriver} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Play className="mr-2 h-4 w-4" />
                        Start
                      </Button> : <>
                        <Button type="button" variant="destructive" onClick={handleDoneClick} disabled={isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Done
                        </Button>
                        <Button type="button" variant={editingDriver?.two_week_block_date ? "outline" : "secondary"} onClick={handleTwoWeekBlock} disabled={isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {editingDriver?.two_week_block_date ? "Cancel 2 Week" : "2 Week"}
                        </Button>
                      </>}
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update Driver
                    </Button>
                  </div>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="files">
              {editingDriver && <DriverFilesManager driverId={editingDriver.id} driverName={editingDriver.name} />}
            </TabsContent>
          </Tabs>

          {/* Termination Notes Section - Show when driver is done */}
          {!editingDriver?.is_active && terminationNotes.length > 0 && <div className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold">Termination Notes</h3>
              {isLoadingNotes ? <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div> : <div className="space-y-2">
                  {terminationNotes.map(note => <Card key={note.id}>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.note}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(note.created_at).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>)}
                </div>}
            </div>}
        </DialogContent>
      </Dialog>

      {/* Done Confirmation Dialog */}
      <AlertDialog open={showDoneConfirmation} onOpenChange={setShowDoneConfirmation}>
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {editingDriver?.name} as done and remove them from active drivers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDone}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Termination Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>Add Termination Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="termination_note">Note</Label>
              <Textarea id="termination_note" value={terminationNote} onChange={e => setTerminationNote(e.target.value)} placeholder="Enter termination note..." className="min-h-[100px]" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
              setShowNoteDialog(false);
              setTerminationNote("");
            }}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveTerminationNote} disabled={isSubmitting || !terminationNote.trim()}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
};
export default Drivers;