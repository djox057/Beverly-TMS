import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, Edit, Phone, Mail, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useDrivers } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriverFilesManager } from "@/components/DriverFilesManager";
interface DriverFormData {
  name: string;
  phone: string;
  email: string;
  truck_id: string;
  trailer_id: string;
  home_address: string;
  home_city: string;
  home_state: string;
  home_latitude: string;
  home_longitude: string;
  personal_id: string;
  fuel_card_number: string;
  cdl_number: string;
  cdl_expiration_date: Date | undefined;
  medical_card_expiration_date: Date | undefined;
  hire_date: Date | undefined;
  termination_date: Date | undefined;
  mvr_date: Date | undefined;
  clearing_house: Date | undefined;
  ssn: string;
  fein: string;
  createAccount: boolean;
  password: string;
}
const Drivers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");
  const itemsPerPage = 15;
  const [formData, setFormData] = useState<DriverFormData>({
    name: "",
    phone: "",
    email: "",
    truck_id: "",
    trailer_id: "",
    home_address: "",
    home_city: "",
    home_state: "",
    home_latitude: "",
    home_longitude: "",
    personal_id: "",
    fuel_card_number: "",
    cdl_number: "",
    cdl_expiration_date: undefined,
    medical_card_expiration_date: undefined,
    hire_date: undefined,
    termination_date: undefined,
    mvr_date: undefined,
    clearing_house: undefined,
    ssn: "",
    fein: "",
    createAccount: false,
    password: ""
  });
  const {
    toast
  } = useToast();
  const {
    data: drivers,
    isLoading,
    refetch
  } = useDrivers();
  
  const { data: availableTrucks } = useAvailableTrucks(editingDriver?.id);
  const { data: availableTrailers } = useAvailableTrailers(selectedTruckId || formData.truck_id);

  // Filter drivers based on search term
  const filteredDrivers = drivers?.filter((driver: any) => driver.name.toLowerCase().includes(searchTerm.toLowerCase()) || driver.phone?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.home_city?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.home_state?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.truck_info?.truck_number?.toLowerCase().includes(searchTerm.toLowerCase()) || driver.truck_info?.trailer_number?.toLowerCase().includes(searchTerm.toLowerCase())) || [];

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
      home_address: "",
      home_city: "",
      home_state: "",
      home_latitude: "",
      home_longitude: "",
      personal_id: "",
      fuel_card_number: "",
      cdl_number: "",
      cdl_expiration_date: undefined,
      medical_card_expiration_date: undefined,
      hire_date: undefined,
      termination_date: undefined,
      mvr_date: undefined,
      clearing_house: undefined,
      ssn: "",
      fein: "",
      createAccount: false,
      password: ""
    });
    setSelectedTruckId("");
  };
  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.createAccount && !formData.email) {
      toast({
        title: "Error",
        description: "Email is required to create a driver account",
        variant: "destructive"
      });
      return;
    }

    if (formData.createAccount && formData.password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Create user account if requested
      if (formData.createAccount && formData.email) {
        const { error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.name,
              role: 'driver'
            }
          }
        });
        
        if (authError) throw authError;
      }

      // Create driver record
      const { data: driverData, error } = await supabase.from('drivers').insert({
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        home_address: formData.home_address || null,
        home_city: formData.home_city || null,
        home_state: formData.home_state || null,
        home_latitude: formData.home_latitude ? parseFloat(formData.home_latitude) : null,
        home_longitude: formData.home_longitude ? parseFloat(formData.home_longitude) : null,
        personal_id: formData.personal_id || null,
        fuel_card_number: formData.fuel_card_number || null,
        cdl_number: formData.cdl_number || null,
        medical_card_expiration_date: formData.medical_card_expiration_date?.toISOString().split('T')[0] || null,
        hire_date: formData.hire_date?.toISOString().split('T')[0] || null,
        termination_date: formData.termination_date?.toISOString().split('T')[0] || null,
        mvr_date: formData.mvr_date?.toISOString().split('T')[0] || null,
        clearing_house: formData.clearing_house?.toISOString().split('T')[0] || null,
        ssn: formData.ssn || null,
        fein: formData.fein || null
      }).select().single();
      
      if (error) throw error;
      
      // Update truck if selected
      if (formData.truck_id && driverData) {
        const { error: truckError } = await supabase
          .from('trucks')
          .update({
            driver1_id: driverData.id,
            trailer_id: formData.trailer_id || null
          })
          .eq('id', formData.truck_id);
        
        if (truckError) throw truckError;
      }
      
      toast({
        title: "Success",
        description: formData.createAccount 
          ? "Driver and account created successfully" 
          : "Driver added successfully"
      });
      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add driver",
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
      const {
        error
      } = await supabase.from('drivers').update({
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        home_address: formData.home_address || null,
        home_city: formData.home_city || null,
        home_state: formData.home_state || null,
        home_latitude: formData.home_latitude ? parseFloat(formData.home_latitude) : null,
        home_longitude: formData.home_longitude ? parseFloat(formData.home_longitude) : null,
        personal_id: formData.personal_id || null,
        fuel_card_number: formData.fuel_card_number || null,
        cdl_number: formData.cdl_number || null,
        cdl_expiration_date: formData.cdl_expiration_date?.toISOString().split('T')[0] || null,
        medical_card_expiration_date: formData.medical_card_expiration_date?.toISOString().split('T')[0] || null,
        hire_date: formData.hire_date?.toISOString().split('T')[0] || null,
        termination_date: formData.termination_date?.toISOString().split('T')[0] || null,
        mvr_date: formData.mvr_date?.toISOString().split('T')[0] || null,
        clearing_house: formData.clearing_house?.toISOString().split('T')[0] || null,
        ssn: formData.ssn || null,
        fein: formData.fein || null
      }).eq('id', editingDriver.id);
      if (error) throw error;
      
      // Update truck if selected
      if (formData.truck_id) {
        const { error: truckError } = await supabase
          .from('trucks')
          .update({
            driver1_id: editingDriver.id,
            trailer_id: formData.trailer_id || null
          })
          .eq('id', formData.truck_id);
        
        if (truckError) throw truckError;
      }
      toast({
        title: "Success",
        description: "Driver updated successfully"
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update driver",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkDriverDone = async () => {
    if (!editingDriver) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ is_active: false })
        .eq('id', editingDriver.id);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `${formData.name} has been marked as done and removed from active drivers`
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      refetch();
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
    
    // Get current truck assignment
    const { data: truckData } = await supabase
      .from('trucks')
      .select('id, trailer_id')
      .or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id}`)
      .maybeSingle();
    
    setFormData({
      name: driver.name || "",
      phone: driver.phone || "",
      email: driver.email || "",
      truck_id: truckData?.id || "",
      trailer_id: truckData?.trailer_id || "",
      home_address: driver.home_address || "",
      home_city: driver.home_city || "",
      home_state: driver.home_state || "",
      home_latitude: driver.home_latitude?.toString() || "",
      home_longitude: driver.home_longitude?.toString() || "",
      personal_id: driver.personal_id || "",
      fuel_card_number: driver.fuel_card_number || "",
      cdl_number: driver.cdl_number || "",
      cdl_expiration_date: driver.cdl_expiration_date ? new Date(driver.cdl_expiration_date) : undefined,
      medical_card_expiration_date: driver.medical_card_expiration_date ? new Date(driver.medical_card_expiration_date) : undefined,
      hire_date: driver.hire_date ? new Date(driver.hire_date) : undefined,
      termination_date: driver.termination_date ? new Date(driver.termination_date) : undefined,
      mvr_date: driver.mvr_date ? new Date(driver.mvr_date) : undefined,
      clearing_house: driver.clearing_house ? new Date(driver.clearing_house) : undefined,
      ssn: driver.ssn || "",
      fein: driver.fein || "",
      createAccount: false,
      password: ""
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
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Driver</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddDriver} className="space-y-4">
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
                  <Combobox
                    options={(availableTrucks || []).map(truck => ({
                      value: truck.id,
                      label: truck.truck_number
                    }))}
                    value={formData.truck_id}
                    onValueChange={(value) => {
                      const selectedTruck = availableTrucks?.find(truck => truck.id === value);
                      setFormData({ 
                        ...formData, 
                        truck_id: value, 
                        trailer_id: selectedTruck?.trailer_id || "" 
                      });
                      setSelectedTruckId(value);
                    }}
                    placeholder="Select truck..."
                    emptyText="No available trucks"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trailer">Trailer Number</Label>
                  <Combobox
                    options={(availableTrailers || []).map(trailer => ({
                      value: trailer.id,
                      label: trailer.trailer_number
                    }))}
                    value={formData.trailer_id}
                    onValueChange={(value) => setFormData({ ...formData, trailer_id: value })}
                    placeholder={formData.truck_id ? "Select trailer..." : "Select truck first"}
                    emptyText="No available trailers"
                  />
                </div>
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
                    <DatePicker
                      date={formData.cdl_expiration_date}
                      onDateChange={(date) => setFormData({
                        ...formData,
                        cdl_expiration_date: date
                      })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hire_date">Hire Date</Label>
                    <DatePicker
                      date={formData.hire_date}
                      onDateChange={(date) => setFormData({
                        ...formData,
                        hire_date: date
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termination_date">Termination Date</Label>
                    <DatePicker
                      date={formData.termination_date}
                      onDateChange={(date) => setFormData({
                        ...formData,
                        termination_date: date
                      })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mvr_date">MVR Date</Label>
                    <DatePicker
                      date={formData.mvr_date}
                      onDateChange={(date) => setFormData({
                        ...formData,
                        mvr_date: date
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                  <Label htmlFor="clearing_house">Clearing House</Label>
                  <DatePicker
                    date={formData.clearing_house}
                    onDateChange={(date) => setFormData({
                      ...formData,
                      clearing_house: date
                    })}
                  />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medical_card_expiration_date">Medical Card Exp</Label>
                    <DatePicker
                      date={formData.medical_card_expiration_date}
                      onDateChange={(date) => setFormData({
                        ...formData,
                        medical_card_expiration_date: date
                      })}
                    />
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
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="create_account"
                    checked={formData.createAccount}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      createAccount: checked as boolean
                    })}
                  />
                  <Label htmlFor="create_account" className="text-sm font-medium cursor-pointer">
                    Create driver portal account
                  </Label>
                </div>
                
                {formData.createAccount && (
                  <div className="space-y-2 pl-6">
                    <Label htmlFor="password">Password*</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={e => setFormData({
                        ...formData,
                        password: e.target.value
                      })}
                      placeholder="Minimum 6 characters"
                      required={formData.createAccount}
                    />
                    <p className="text-xs text-muted-foreground">
                      Driver can change this password after first login
                    </p>
                  </div>
                )}
              </div>

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
                  <TableHead>Contact</TableHead>
                  <TableHead>Home Location</TableHead>
                  <TableHead>Portal Access</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDrivers.length === 0 ? <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No drivers found
                    </TableCell>
                  </TableRow> : paginatedDrivers.map((driver: any) => <TableRow key={driver.id}>
                      <TableCell className="font-medium">{driver.name}</TableCell>
                      <TableCell>{driver.truck_info?.truck_number || "—"}</TableCell>
                      <TableCell>{driver.truck_info?.trailer_number || "—"}</TableCell>
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
                        {driver.has_account ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            No Access
                          </span>
                        )}
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
                {paginatedDrivers.length > 0 && Array.from({ length: itemsPerPage - paginatedDrivers.length }).map((_, index) => (
                  <TableRow key={`empty-${index}`} className="hover:bg-transparent">
                    <TableCell colSpan={7} className="h-[57px]">&nbsp;</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination */}
          {filteredDrivers.length > 0 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  
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
                    <Combobox
                      options={(availableTrucks || []).map(truck => ({
                        value: truck.id,
                        label: truck.truck_number
                      }))}
                      value={formData.truck_id}
                      onValueChange={(value) => {
                        const selectedTruck = availableTrucks?.find(truck => truck.id === value);
                        setFormData({ 
                          ...formData, 
                          truck_id: value, 
                          trailer_id: selectedTruck?.trailer_id || "" 
                        });
                        setSelectedTruckId(value);
                      }}
                      placeholder="Select truck..."
                      emptyText="No available trucks"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_trailer">Trailer Number</Label>
                    <Combobox
                      options={(availableTrailers || []).map(trailer => ({
                        value: trailer.id,
                        label: trailer.trailer_number
                      }))}
                      value={formData.trailer_id}
                      onValueChange={(value) => setFormData({ ...formData, trailer_id: value })}
                      placeholder={formData.truck_id ? "Select trailer..." : "Select truck first"}
                      emptyText="No available trailers"
                    />
                  </div>
                </div>

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

                <div className="border-t pt-4 space-y-4">
                  
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
                      <DatePicker
                        date={formData.cdl_expiration_date}
                        onDateChange={(date) => setFormData({
                          ...formData,
                          cdl_expiration_date: date
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_hire_date">Hire Date</Label>
                      <DatePicker
                        date={formData.hire_date}
                        onDateChange={(date) => setFormData({
                          ...formData,
                          hire_date: date
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_termination_date">Termination Date</Label>
                      <DatePicker
                        date={formData.termination_date}
                        onDateChange={(date) => setFormData({
                          ...formData,
                          termination_date: date
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_mvr_date">MVR Date</Label>
                      <DatePicker
                        date={formData.mvr_date}
                        onDateChange={(date) => setFormData({
                          ...formData,
                          mvr_date: date
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_clearing_house">Clearing House</Label>
                      <DatePicker
                        date={formData.clearing_house}
                        onDateChange={(date) => setFormData({
                          ...formData,
                          clearing_house: date
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_medical_card_expiration_date">Medical Card Exp</Label>
                      <DatePicker
                        date={formData.medical_card_expiration_date}
                        onDateChange={(date) => setFormData({
                          ...formData,
                          medical_card_expiration_date: date
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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

                <div className="flex justify-between gap-3">
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={handleMarkDriverDone}
                    disabled={isSubmitting}
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Done
                  </Button>
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
              {editingDriver && (
                <DriverFilesManager 
                  driverId={editingDriver.id} 
                  driverName={editingDriver.name}
                />
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>;
};
export default Drivers;