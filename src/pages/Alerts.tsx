import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious,
  PaginationEllipsis
} from "@/components/ui/pagination";
import { AlertTriangle, Truck, Package, User, Search, Plus, Image, Trash2 } from "lucide-react";
import { useExpiringTrucks, useExpiringTrailers, useExpiringDrivers } from "@/hooks/useExpiringAlerts";
import { useAuthContext } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTrucks } from "@/hooks/useTrucks";
import { useTrailers } from "@/hooks/useTrailers";
import { useDrivers } from "@/hooks/useDrivers";
import { useCompanies } from "@/hooks/useCompanies";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TruckFilesManager } from "@/components/TruckFilesManager";
import { TrailerFilesManager } from "@/components/TrailerFilesManager";
import { DriverFilesManager } from "@/components/DriverFilesManager";

const formatDate = (date: string | null) => {
  if (!date) return "N/A";
  return format(new Date(date), "MM/dd/yyyy");
};

const getExpirationStatus = (date: string | null) => {
  if (!date) return { variant: "secondary" as const, label: "No Date", className: "" };
  
  const expirationDate = new Date(date);
  const now = new Date();
  const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiration < 0) {
    return { variant: "destructive" as const, label: "Expired", className: "text-red-500 font-semibold" };
  } else if (daysUntilExpiration <= 30) {
    return { variant: "destructive" as const, label: `${daysUntilExpiration} days`, className: "text-red-500 font-semibold" };
  } else if (daysUntilExpiration <= 60) {
    return { variant: "outline" as const, label: `${daysUntilExpiration} days`, className: "text-yellow-500 font-semibold" };
  } else {
    return { variant: "default" as const, label: `${daysUntilExpiration} days`, className: "" };
  }
};

// Maintenance date status: red if ≤7 days, yellow if ≤30 days
const getMaintenanceStatus = (date: string | null) => {
  if (!date) return { color: "text-muted-foreground", label: "N/A" };
  
  const maintenanceDate = new Date(date);
  const now = new Date();
  const daysUntil = Math.ceil((maintenanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntil <= 7) {
    return { color: "text-red-500 font-semibold", label: formatDate(date) };
  } else if (daysUntil <= 30) {
    return { color: "text-yellow-500 font-semibold", label: formatDate(date) };
  } else {
    return { color: "", label: formatDate(date) };
  }
};

// Chicago-time based calculation for random drug test date
const getDrugTestStatus = (date: string | null) => {
  if (!date) return { variant: "secondary" as const, label: "No Date" };
  
  const chicagoNow = toZonedTime(new Date(), "America/Chicago");
  const testDate = new Date(date);
  
  // Reset times to start of day for accurate day calculation
  const nowStartOfDay = new Date(chicagoNow.getFullYear(), chicagoNow.getMonth(), chicagoNow.getDate());
  const testStartOfDay = new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate());
  
  const daysUntil = Math.ceil((testStartOfDay.getTime() - nowStartOfDay.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) {
    return { variant: "destructive" as const, label: `${Math.abs(daysUntil)} days overdue` };
  } else if (daysUntil === 0) {
    return { variant: "destructive" as const, label: "Due today" };
  } else if (daysUntil <= 30) {
    return { variant: "destructive" as const, label: `${daysUntil} days left` };
  } else {
    return { variant: "default" as const, label: `${daysUntil} days left` };
  }
};

export default function Alerts() {
  const { data: trucks = [], isLoading: trucksLoading } = useExpiringTrucks();
  const { data: trailers = [], isLoading: trailersLoading } = useExpiringTrailers();
  const { data: drivers = [], isLoading: driversLoading } = useExpiringDrivers();
  const { hasRole } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all data for edit dialogs
  const { data: allTrucks } = useTrucks();
  const { data: allTrailers } = useTrailers();
  const { data: allDrivers } = useDrivers();
  const { data: companies } = useCompanies();
  const { allDispatchers } = useFleetManagement();
  const { data: availableTrucks } = useAvailableTrucks();
  const { data: availableTrailers } = useAvailableTrailers();

  const [trucksPage, setTrucksPage] = useState(1);
  const [trailersPage, setTrailersPage] = useState(1);
  const [driversPage, setDriversPage] = useState(1);
  const itemsPerPage = 50;

  // Search states
  const [activeTab, setActiveTab] = useState("trucks");
  const [trucksSearch, setTrucksSearch] = useState("");
  const [trailersSearch, setTrailersSearch] = useState("");
  const [driversSearch, setDriversSearch] = useState("");
  
  // "Is Assigned" toggle
  const [isAssignedFilter, setIsAssignedFilter] = useState(false);

  // Temporary plates state
  const [isAddTempPlateDialogOpen, setIsAddTempPlateDialogOpen] = useState(false);
  const [tempPlateTruckId, setTempPlateTruckId] = useState("");
  const [isAddingTempPlate, setIsAddingTempPlate] = useState(false);
  const [deleteTempPlateId, setDeleteTempPlateId] = useState<string | null>(null);

  // Temporary plates query
  const { data: temporaryPlates = [], isLoading: tempPlatesLoading } = useQuery({
    queryKey: ['temporary-plates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('temporary_plates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch files per plate
  const { data: tempPlateFileMap = {} } = useQuery({
    queryKey: ['temporary-plate-file-map', temporaryPlates.map(p => p.id).join(',')],
    queryFn: async () => {
      const map: Record<string, string[]> = {};
      for (const plate of temporaryPlates) {
        const { data } = await supabase.storage
          .from('temporary-plate-files')
          .list(plate.id, { limit: 100 });
        if (data && data.length > 0) {
          map[plate.id] = data.map(f => f.name);
        }
      }
      return map;
    },
    enabled: temporaryPlates.length > 0,
  });

  // Column filters
  type TruckColumnFilter = "all" | "dot" | "plate" | "insurance" | "oil_change" | "tires_swap" | "maintenance_check";
  type TrailerColumnFilter = "all" | "dot" | "plate" | "insurance";
  type DriverColumnFilter = "all" | "cdl" | "mvr" | "clearing_house" | "medical" | "drug_test";
  const [truckColumnFilter, setTruckColumnFilter] = useState<TruckColumnFilter>("all");
  const [trailerColumnFilter, setTrailerColumnFilter] = useState<TrailerColumnFilter>("all");
  const [driverColumnFilter, setDriverColumnFilter] = useState<DriverColumnFilter>("all");

  // Build sets for "is assigned" filtering
  const assignedTruckIds = new Set<string>();
  const assignedTrailerIds = new Set<string>();
  const assignedDriverIds = new Set<string>();
  if (allTrucks) {
    for (const t of allTrucks) {
      if (t.driver1_id) {
        assignedTruckIds.add(t.id);
        assignedDriverIds.add(t.driver1_id);
      }
      if (t.driver2_id) assignedDriverIds.add(t.driver2_id);
      if (t.trailer_id) assignedTrailerIds.add(t.trailer_id);
    }
  }

  // Helper to check if a date is expiring (within 60 days)
  const isExpiring = (date: string | null) => {
    if (!date) return false;
    const expirationDate = new Date(date);
    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    return expirationDate <= sixtyDaysFromNow;
  };

  // Helper to check if a maintenance date needs attention (within 30 days - yellow or red)
  const needsMaintenanceAttention = (date: string | null) => {
    if (!date) return false;
    const maintenanceDate = new Date(date);
    const now = new Date();
    const daysUntil = Math.ceil((maintenanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 30;
  };

  // Build lookup maps for truck numbers
  const truckByTrailerId = new Map<string, string>();
  const truckByDriverId = new Map<string, string>();
  if (allTrucks) {
    for (const t of allTrucks) {
      if (t.trailer_id) truckByTrailerId.set(t.trailer_id, t.truck_number);
      if (t.driver1_id) truckByDriverId.set(t.driver1_id, t.truck_number);
      if (t.driver2_id) truckByDriverId.set(t.driver2_id, t.truck_number);
    }
  }

  // Filter data based on search and column filter
  const filteredTrucks = trucks.filter((truck) => {
    if (isAssignedFilter && !assignedTruckIds.has(truck.id)) return false;
    const matchesSearch = truck.truck_number?.toLowerCase().includes(trucksSearch.toLowerCase()) ||
      truck.company?.name?.toLowerCase().includes(trucksSearch.toLowerCase());
    
    if (!matchesSearch) return false;
    if (truckColumnFilter === "all") return true;
    
    switch (truckColumnFilter) {
      case "dot": return isExpiring(truck.dot_inspection_date);
      case "plate": return isExpiring(truck.plate_expiration_date);
      case "insurance": return isExpiring(truck.insurance_expiration_date);
      case "oil_change": return needsMaintenanceAttention(truck.oil_change_date);
      case "tires_swap": return needsMaintenanceAttention(truck.tires_swap_date);
      case "maintenance_check": return needsMaintenanceAttention(truck.maintenance_check_date);
      default: return true;
    }
  });

  const filteredTrailers = trailers.filter((trailer) => {
    if (isAssignedFilter && !assignedTrailerIds.has(trailer.id)) return false;
    const searchLower = trailersSearch.toLowerCase();
    const truckNum = truckByTrailerId.get(trailer.id) || "";
    const matchesSearch = trailer.trailer_number?.toLowerCase().includes(searchLower) ||
      truckNum.toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;
    if (trailerColumnFilter === "all") return true;
    
    switch (trailerColumnFilter) {
      case "dot": return isExpiring(trailer.dot_inspection_date);
      case "plate": return isExpiring(trailer.plate_expiration_date);
      case "insurance": return isExpiring(trailer.insurance_expiration_date);
      default: return true;
    }
  });

  const filteredDrivers = drivers.filter((driver) => {
    if (isAssignedFilter && !assignedDriverIds.has(driver.id)) return false;
    // First apply search filter
    const searchLower = driversSearch.toLowerCase();
    const truckNum = truckByDriverId.get(driver.id) || "";
    const matchesSearch = driver.name?.toLowerCase().includes(searchLower) ||
      driver.company_name?.toLowerCase().includes(searchLower) ||
      truckNum.toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;
    
    // Then apply column filter
    if (driverColumnFilter === "all") return true;
    
    switch (driverColumnFilter) {
      case "cdl": return isExpiring(driver.cdl_expiration_date);
      case "mvr": return isExpiring(driver.mvr_date);
      case "clearing_house": return isExpiring(driver.clearing_house);
      case "medical": return isExpiring(driver.medical_card_expiration_date);
      case "drug_test": return isExpiring(driver.random_drug_test_date);
      default: return true;
    }
  });

  // Edit dialog states
  const [isEditTruckDialogOpen, setIsEditTruckDialogOpen] = useState(false);
  const [isEditTrailerDialogOpen, setIsEditTrailerDialogOpen] = useState(false);
  const [isEditDriverDialogOpen, setIsEditDriverDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<any>(null);
  const [editingTrailer, setEditingTrailer] = useState<any>(null);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination logic for trucks
  const trucksTotalPages = Math.ceil(filteredTrucks.length / itemsPerPage);
  const trucksStartIndex = (trucksPage - 1) * itemsPerPage;
  const trucksEndIndex = trucksStartIndex + itemsPerPage;
  const paginatedTrucks = filteredTrucks.slice(trucksStartIndex, trucksEndIndex);

  // Pagination logic for trailers
  const trailersTotalPages = Math.ceil(filteredTrailers.length / itemsPerPage);
  const trailersStartIndex = (trailersPage - 1) * itemsPerPage;
  const trailersEndIndex = trailersStartIndex + itemsPerPage;
  const paginatedTrailers = filteredTrailers.slice(trailersStartIndex, trailersEndIndex);

  // Pagination logic for drivers
  const driversTotalPages = Math.ceil(filteredDrivers.length / itemsPerPage);
  const driversStartIndex = (driversPage - 1) * itemsPerPage;
  const driversEndIndex = driversStartIndex + itemsPerPage;
  const paginatedDrivers = filteredDrivers.slice(driversStartIndex, driversEndIndex);

  // Get current search value and setter based on active tab
  const getCurrentSearch = () => {
    switch (activeTab) {
      case "trucks": return trucksSearch;
      case "trailers": return trailersSearch;
      case "drivers": return driversSearch;
      default: return "";
    }
  };

  const setCurrentSearch = (value: string) => {
    switch (activeTab) {
      case "trucks": 
        setTrucksSearch(value);
        setTrucksPage(1);
        break;
      case "trailers": 
        setTrailersSearch(value);
        setTrailersPage(1);
        break;
      case "drivers": 
        setDriversSearch(value);
        setDriversPage(1);
        break;
    }
  };

  // Edit dialog handlers
  const openEditTruckDialog = (truckId: string) => {
    const truck = allTrucks?.find(t => t.id === truckId);
    if (truck) {
      setEditingTruck(truck);
      setIsEditTruckDialogOpen(true);
    }
  };

  const openEditTrailerDialog = (trailerId: string) => {
    const trailer = allTrailers?.find(t => t.id === trailerId);
    if (trailer) {
      setEditingTrailer(trailer);
      setIsEditTrailerDialogOpen(true);
    }
  };

  const openEditDriverDialog = (driverId: string) => {
    const driver = allDrivers?.find(d => d.id === driverId);
    if (driver) {
      setEditingDriver(driver);
      setIsEditDriverDialogOpen(true);
    }
  };

  const handleEditTruck = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const updates = {
        truck_number: formData.get('truck_number') as string,
        vin: formData.get('vin') as string || null,
        dot_inspection_date: formData.get('dot_inspection_date') as string || null,
        plate_expiration_date: formData.get('plate_expiration_date') as string || null,
        insurance_expiration_date: formData.get('insurance_expiration_date') as string || null,
        oil_change_date: formData.get('oil_change_date') as string || null,
        tires_swap_date: formData.get('tires_swap_date') as string || null,
        maintenance_check_date: formData.get('maintenance_check_date') as string || null,
      };

      const { error } = await supabase
        .from('trucks')
        .update(updates)
        .eq('id', editingTruck.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Truck updated successfully"
      });

      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-trucks'] });
      setIsEditTruckDialogOpen(false);
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

  const handleEditTrailer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const updates = {
        trailer_number: formData.get('trailer_number') as string,
        trailer_type: formData.get('trailer_type') as string || null,
        vin: formData.get('vin') as string || null,
        dot_inspection_date: formData.get('dot_inspection_date') as string || null,
        plate_expiration_date: formData.get('plate_expiration_date') as string || null,
        insurance_expiration_date: formData.get('insurance_expiration_date') as string || null,
      };

      const { error } = await supabase
        .from('trailers')
        .update(updates)
        .eq('id', editingTrailer.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Trailer updated successfully"
      });

      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-trailers'] });
      setIsEditTrailerDialogOpen(false);
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

  const handleEditDriver = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const updates = {
        name: formData.get('name') as string,
        cdl_expiration_date: formData.get('cdl_expiration_date') as string || null,
        mvr_date: formData.get('mvr_date') as string || null,
        clearing_house: formData.get('clearing_house') as string || null,
        medical_card_expiration_date: formData.get('medical_card_expiration_date') as string || null,
        random_drug_test_date: formData.get('random_drug_test_date') as string || null,
      };

      const { error } = await supabase
        .from('drivers')
        .update(updates)
        .eq('id', editingDriver.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Driver updated successfully"
      });

      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-drivers'] });
      setIsEditDriverDialogOpen(false);
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

  // Temporary plates handlers
  const handleAddTemporaryPlate = async () => {
    if (!tempPlateTruckId) return;
    setIsAddingTempPlate(true);
    try {
      const { error } = await supabase
        .from('temporary_plates')
        .insert({ truck_id: tempPlateTruckId, added_by: (await supabase.auth.getUser()).data.user?.id });
      if (error) throw error;
      toast({ title: "Success", description: "Truck added to temporary plates list" });
      queryClient.invalidateQueries({ queryKey: ['temporary-plates'] });
      setIsAddTempPlateDialogOpen(false);
      setTempPlateTruckId("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAddingTempPlate(false);
    }
  };

  const handleDeleteTemporaryPlate = async (plateId: string) => {
    try {
      const { data: files } = await supabase.storage.from('temporary-plate-files').list(plateId);
      if (files && files.length > 0) {
        await supabase.storage.from('temporary-plate-files').remove(files.map(f => `${plateId}/${f.name}`));
      }
      const { error } = await supabase.from('temporary_plates').delete().eq('id', plateId);
      if (error) throw error;
      toast({ title: "Success", description: "Removed from temporary plates" });
      queryClient.invalidateQueries({ queryKey: ['temporary-plates'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-plate-file-map'] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleUploadTempPlateFile = async (plateId: string, file: File) => {
    const sanitizedName = file.name.replace(/[\s\-]/g, '_');
    const filePath = `${plateId}/${sanitizedName}`;
    const { error } = await supabase.storage.from('temporary-plate-files').upload(filePath, file);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Picture uploaded" });
    queryClient.invalidateQueries({ queryKey: ['temporary-plate-file-map'] });
  };

  const handleDeleteTempPlateFile = async (plateId: string, fileName: string) => {
    const { error } = await supabase.storage.from('temporary-plate-files').remove([`${plateId}/${fileName}`]);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Picture deleted" });
    queryClient.invalidateQueries({ queryKey: ['temporary-plate-file-map'] });
  };

  const tempPlateTruckMap = new Map<string, any>();
  if (allTrucks) {
    for (const t of allTrucks) {
      tempPlateTruckMap.set(t.id, t);
    }
  }

  const renderPaginationItems = (currentPage: number, totalPages: number, setPage: (page: number) => void) => {
    const items = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      items.push(
        <PaginationItem key="1">
          <PaginationLink onClick={() => setPage(1)}>1</PaginationLink>
        </PaginationItem>
      );
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => setPage(i)}
            isActive={currentPage === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setPage(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  // Check if user has admin, safety or maintenance role
  if (!hasRole('admin') && !hasRole('safety') && !hasRole('maintenance')) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">This page is only accessible to Admin, Safety and Maintenance roles.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <h1 className="text-3xl font-bold">Expiration Alerts</h1>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Items Expiring Within 60 Days</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is-assigned"
                  checked={isAssignedFilter}
                  onCheckedChange={(checked) => setIsAssignedFilter(checked === true)}
                />
                <label htmlFor="is-assigned" className="text-sm font-medium cursor-pointer whitespace-nowrap">
                  Is Assigned
                </label>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Search ${activeTab}...`}
                  value={getCurrentSearch()}
                  onChange={(e) => setCurrentSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="trucks" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="trucks" className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Trucks ({filteredTrucks.length}{trucksSearch ? ` of ${trucks.length}` : ''})
              </TabsTrigger>
              <TabsTrigger value="trailers" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Trailers ({filteredTrailers.length}{trailersSearch ? ` of ${trailers.length}` : ''})
              </TabsTrigger>
              <TabsTrigger value="drivers" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Drivers ({filteredDrivers.length}{driversSearch ? ` of ${drivers.length}` : ''})
              </TabsTrigger>
              <TabsTrigger value="temp_plates" className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                Temp Plates ({temporaryPlates.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trucks" className="mt-6">
              {trucksLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded">
                      <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : trucks.length === 0 ? (
                <p className="text-muted-foreground">No trucks with expiring documents.</p>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Truck #</TableHead>
                      <TableHead className="w-[130px]">Company</TableHead>
                      <TableHead 
                        onClick={() => setTruckColumnFilter(truckColumnFilter === "dot" ? "all" : "dot")}
                        className={`w-[200px] cursor-pointer hover:bg-muted/50 ${truckColumnFilter === "dot" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        DOT Inspection {truckColumnFilter === "dot" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setTruckColumnFilter(truckColumnFilter === "plate" ? "all" : "plate")}
                        className={`w-[200px] cursor-pointer hover:bg-muted/50 ${truckColumnFilter === "plate" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Plate Expiration {truckColumnFilter === "plate" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setTruckColumnFilter(truckColumnFilter === "insurance" ? "all" : "insurance")}
                        className={`w-[210px] cursor-pointer hover:bg-muted/50 ${truckColumnFilter === "insurance" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Insurance Expiration {truckColumnFilter === "insurance" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setTruckColumnFilter(truckColumnFilter === "oil_change" ? "all" : "oil_change")}
                        className={`w-[120px] cursor-pointer hover:bg-muted/50 ${truckColumnFilter === "oil_change" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Oil Change {truckColumnFilter === "oil_change" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setTruckColumnFilter(truckColumnFilter === "tires_swap" ? "all" : "tires_swap")}
                        className={`w-[120px] cursor-pointer hover:bg-muted/50 ${truckColumnFilter === "tires_swap" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Tires Swap {truckColumnFilter === "tires_swap" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setTruckColumnFilter(truckColumnFilter === "maintenance_check" ? "all" : "maintenance_check")}
                        className={`w-[160px] cursor-pointer hover:bg-muted/50 ${truckColumnFilter === "maintenance_check" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Maintenance Check {truckColumnFilter === "maintenance_check" && "✓"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                   <TableBody>
                     {paginatedTrucks.map((truck) => (
                       <TableRow key={truck.id}>
                         <TableCell className="font-medium">
                           <button 
                             onClick={() => openEditTruckDialog(truck.id)}
                             className="text-primary hover:underline cursor-pointer"
                           >
                             {truck.truck_number}
                           </button>
                         </TableCell>
                         <TableCell>{truck.company?.name || "N/A"}</TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             <span className={getExpirationStatus(truck.dot_inspection_date).className}>
                               {formatDate(truck.dot_inspection_date)}
                             </span>
                             {truck.dot_inspection_date && (
                               <Badge variant={getExpirationStatus(truck.dot_inspection_date).variant}>
                                 {getExpirationStatus(truck.dot_inspection_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             <span className={getExpirationStatus(truck.plate_expiration_date).className}>
                               {formatDate(truck.plate_expiration_date)}
                             </span>
                             {truck.plate_expiration_date && (
                               <Badge variant={getExpirationStatus(truck.plate_expiration_date).variant}>
                                 {getExpirationStatus(truck.plate_expiration_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             <span className={getExpirationStatus(truck.insurance_expiration_date).className}>
                               {formatDate(truck.insurance_expiration_date)}
                             </span>
                             {truck.insurance_expiration_date && (
                               <Badge variant={getExpirationStatus(truck.insurance_expiration_date).variant}>
                                 {getExpirationStatus(truck.insurance_expiration_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <span className={getMaintenanceStatus(truck.oil_change_date).color}>
                             {getMaintenanceStatus(truck.oil_change_date).label}
                           </span>
                         </TableCell>
                         <TableCell>
                           <span className={getMaintenanceStatus(truck.tires_swap_date).color}>
                             {getMaintenanceStatus(truck.tires_swap_date).label}
                           </span>
                         </TableCell>
                         <TableCell>
                           <span className={getMaintenanceStatus(truck.maintenance_check_date).color}>
                             {getMaintenanceStatus(truck.maintenance_check_date).label}
                           </span>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               )}
               
               {trucksTotalPages > 1 && (
                 <div className="mt-4">
                   <Pagination>
                     <PaginationContent>
                       <PaginationItem>
                         <PaginationPrevious 
                           onClick={() => setTrucksPage(p => Math.max(1, p - 1))}
                           className={trucksPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                         />
                       </PaginationItem>
                       {renderPaginationItems(trucksPage, trucksTotalPages, setTrucksPage)}
                       <PaginationItem>
                         <PaginationNext 
                           onClick={() => setTrucksPage(p => Math.min(trucksTotalPages, p + 1))}
                           className={trucksPage === trucksTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                         />
                       </PaginationItem>
                     </PaginationContent>
                   </Pagination>
                 </div>
               )}
            </TabsContent>

            <TabsContent value="trailers" className="mt-6">
              {trailersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded">
                      <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : trailers.length === 0 ? (
                <p className="text-muted-foreground">No trailers with expiring documents.</p>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Trailer #</TableHead>
                      <TableHead className="w-[90px]">Truck #</TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead 
                        onClick={() => setTrailerColumnFilter(trailerColumnFilter === "dot" ? "all" : "dot")}
                        className={`w-[200px] cursor-pointer hover:bg-muted/50 ${trailerColumnFilter === "dot" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        DOT Inspection {trailerColumnFilter === "dot" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setTrailerColumnFilter(trailerColumnFilter === "plate" ? "all" : "plate")}
                        className={`w-[200px] cursor-pointer hover:bg-muted/50 ${trailerColumnFilter === "plate" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Plate Expiration {trailerColumnFilter === "plate" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setTrailerColumnFilter(trailerColumnFilter === "insurance" ? "all" : "insurance")}
                        className={`w-[210px] cursor-pointer hover:bg-muted/50 ${trailerColumnFilter === "insurance" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Insurance Expiration {trailerColumnFilter === "insurance" && "✓"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                   <TableBody>
                     {paginatedTrailers.map((trailer) => (
                       <TableRow key={trailer.id}>
                         <TableCell className="font-medium">
                           <button 
                             onClick={() => openEditTrailerDialog(trailer.id)}
                             className="text-primary hover:underline cursor-pointer"
                           >
                             {trailer.trailer_number}
                           </button>
                         </TableCell>
                         <TableCell>{truckByTrailerId.get(trailer.id) || "—"}</TableCell>
                         <TableCell>{trailer.trailer_type || "N/A"}</TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             <span className={getExpirationStatus(trailer.dot_inspection_date).className}>
                               {formatDate(trailer.dot_inspection_date)}
                             </span>
                             {trailer.dot_inspection_date && (
                               <Badge variant={getExpirationStatus(trailer.dot_inspection_date).variant}>
                                 {getExpirationStatus(trailer.dot_inspection_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             <span className={getExpirationStatus(trailer.plate_expiration_date).className}>
                               {formatDate(trailer.plate_expiration_date)}
                             </span>
                             {trailer.plate_expiration_date && (
                               <Badge variant={getExpirationStatus(trailer.plate_expiration_date).variant}>
                                 {getExpirationStatus(trailer.plate_expiration_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             <span className={getExpirationStatus(trailer.insurance_expiration_date).className}>
                               {formatDate(trailer.insurance_expiration_date)}
                             </span>
                             {trailer.insurance_expiration_date && (
                               <Badge variant={getExpirationStatus(trailer.insurance_expiration_date).variant}>
                                 {getExpirationStatus(trailer.insurance_expiration_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               )}
               
               {trailersTotalPages > 1 && (
                 <div className="mt-4">
                   <Pagination>
                     <PaginationContent>
                       <PaginationItem>
                         <PaginationPrevious 
                           onClick={() => setTrailersPage(p => Math.max(1, p - 1))}
                           className={trailersPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                         />
                       </PaginationItem>
                       {renderPaginationItems(trailersPage, trailersTotalPages, setTrailersPage)}
                       <PaginationItem>
                         <PaginationNext 
                           onClick={() => setTrailersPage(p => Math.min(trailersTotalPages, p + 1))}
                           className={trailersPage === trailersTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                         />
                       </PaginationItem>
                     </PaginationContent>
                   </Pagination>
                 </div>
               )}
            </TabsContent>

            <TabsContent value="drivers" className="mt-6">
              {driversLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded">
                      <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : drivers.length === 0 ? (
                <p className="text-muted-foreground">No drivers with expiring documents.</p>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Driver Name</TableHead>
                      <TableHead className="w-[90px]">Truck #</TableHead>
                      <TableHead 
                        onClick={() => setDriverColumnFilter(driverColumnFilter === "cdl" ? "all" : "cdl")}
                        className={`w-[190px] cursor-pointer hover:bg-muted/50 ${driverColumnFilter === "cdl" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        CDL Expiration {driverColumnFilter === "cdl" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setDriverColumnFilter(driverColumnFilter === "mvr" ? "all" : "mvr")}
                        className={`w-[170px] cursor-pointer hover:bg-muted/50 ${driverColumnFilter === "mvr" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        MVR Date {driverColumnFilter === "mvr" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setDriverColumnFilter(driverColumnFilter === "clearing_house" ? "all" : "clearing_house")}
                        className={`w-[190px] cursor-pointer hover:bg-muted/50 ${driverColumnFilter === "clearing_house" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Clearing House {driverColumnFilter === "clearing_house" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setDriverColumnFilter(driverColumnFilter === "medical" ? "all" : "medical")}
                        className={`w-[200px] cursor-pointer hover:bg-muted/50 ${driverColumnFilter === "medical" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Medical Card Exp {driverColumnFilter === "medical" && "✓"}
                      </TableHead>
                      <TableHead 
                        onClick={() => setDriverColumnFilter(driverColumnFilter === "drug_test" ? "all" : "drug_test")}
                        className={`w-[200px] cursor-pointer hover:bg-muted/50 ${driverColumnFilter === "drug_test" ? "bg-primary/10 text-primary" : ""}`}
                      >
                        Random Drug Test {driverColumnFilter === "drug_test" && "✓"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                   <TableBody>
                     {paginatedDrivers.map((driver) => (
                       <TableRow key={driver.id}>
                         <TableCell className="font-medium">
                           <button 
                             onClick={() => openEditDriverDialog(driver.id)}
                             className="text-primary hover:underline cursor-pointer"
                           >
                            {driver.name}
                            </button>
                          </TableCell>
                          <TableCell>{truckByDriverId.get(driver.id) || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {formatDate(driver.cdl_expiration_date)}
                             {driver.cdl_expiration_date && (
                               <Badge variant={getExpirationStatus(driver.cdl_expiration_date).variant}>
                                 {getExpirationStatus(driver.cdl_expiration_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(driver.mvr_date)}
                             {driver.mvr_date && (
                               <Badge variant={getExpirationStatus(driver.mvr_date).variant}>
                                 {getExpirationStatus(driver.mvr_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(driver.clearing_house)}
                             {driver.clearing_house && (
                               <Badge variant={getExpirationStatus(driver.clearing_house).variant}>
                                 {getExpirationStatus(driver.clearing_house).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(driver.medical_card_expiration_date)}
                             {driver.medical_card_expiration_date && (
                               <Badge variant={getExpirationStatus(driver.medical_card_expiration_date).variant}>
                                 {getExpirationStatus(driver.medical_card_expiration_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(driver.random_drug_test_date)}
                             {driver.random_drug_test_date && (
                               <Badge variant={getDrugTestStatus(driver.random_drug_test_date).variant}>
                                 {getDrugTestStatus(driver.random_drug_test_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               )}
               
               {driversTotalPages > 1 && (
                 <div className="mt-4">
                   <Pagination>
                     <PaginationContent>
                       <PaginationItem>
                         <PaginationPrevious 
                           onClick={() => setDriversPage(p => Math.max(1, p - 1))}
                           className={driversPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                         />
                       </PaginationItem>
                       {renderPaginationItems(driversPage, driversTotalPages, setDriversPage)}
                       <PaginationItem>
                         <PaginationNext 
                           onClick={() => setDriversPage(p => Math.min(driversTotalPages, p + 1))}
                           className={driversPage === driversTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                         />
                       </PaginationItem>
                     </PaginationContent>
                   </Pagination>
                 </div>
               )}
            </TabsContent>

            <TabsContent value="temp_plates" className="mt-6">
              <div className="flex justify-end mb-4">
                <Button onClick={() => setIsAddTempPlateDialogOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {tempPlatesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded">
                      <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : temporaryPlates.length === 0 ? (
                <p className="text-muted-foreground">No trucks with temporary plates.</p>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Truck #</TableHead>
                      <TableHead className="w-[200px]">Driver Name</TableHead>
                      <TableHead className="w-[180px]">Dispatcher</TableHead>
                      <TableHead className="w-[300px]">Pictures</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {temporaryPlates.map((plate) => {
                      const truck = tempPlateTruckMap.get(plate.truck_id);
                      const hasFiles = (tempPlateFileMap[plate.id]?.length || 0) > 0;
                      return (
                        <TableRow key={plate.id} className="h-[48px]" style={{ height: '48px' }}>
                          <TableCell className={`font-medium ${hasFiles ? 'bg-green-100 dark:bg-green-900/30' : ''}`}>
                            {truck?.truck_number || '—'}
                          </TableCell>
                          <TableCell className={hasFiles ? 'bg-green-100 dark:bg-green-900/30' : ''}>
                            {truck?.driver1?.name || '—'}
                          </TableCell>
                          <TableCell className={hasFiles ? 'bg-green-100 dark:bg-green-900/30' : ''}>
                            {truck?.dispatcher?.full_name || '—'}
                          </TableCell>
                          <TableCell className={hasFiles ? 'bg-green-100 dark:bg-green-900/30' : ''}>
                            <div className="flex items-center gap-2 flex-wrap">
                              {(tempPlateFileMap[plate.id] || []).map((fileName) => (
                                <div key={fileName} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                                  <span className="truncate max-w-[120px]">{fileName}</span>
                                  <button
                                    onClick={() => handleDeleteTempPlateFile(plate.id, fileName)}
                                    className="text-destructive hover:text-destructive/80"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'image/*';
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) handleUploadTempPlateFile(plate.id, file);
                                  };
                                  input.click();
                                }}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Upload
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className={hasFiles ? 'bg-green-100 dark:bg-green-900/30' : ''}>
                            {(hasRole('admin') || hasRole('manager') || hasRole('safety')) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive/80"
                                onClick={() => setDeleteTempPlateId(plate.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit Truck Dialog */}
      <Dialog open={isEditTruckDialogOpen} onOpenChange={setIsEditTruckDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Truck</DialogTitle>
          </DialogHeader>
          {editingTruck && (
            <form onSubmit={handleEditTruck} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="truck_number">Truck Number *</Label>
                  <Input id="truck_number" name="truck_number" defaultValue={editingTruck.truck_number} required />
                </div>
                <div>
                  <Label htmlFor="vin">VIN</Label>
                  <Input id="vin" name="vin" defaultValue={editingTruck.vin || ""} />
                </div>
                <div>
                  <Label htmlFor="dot_inspection_date">DOT Inspection Date</Label>
                  <Input id="dot_inspection_date" name="dot_inspection_date" type="date" defaultValue={editingTruck.dot_inspection_date || ""} />
                </div>
                <div>
                  <Label htmlFor="plate_expiration_date">Plate Expiration Date</Label>
                  <Input id="plate_expiration_date" name="plate_expiration_date" type="date" defaultValue={editingTruck.plate_expiration_date || ""} />
                </div>
                <div>
                  <Label htmlFor="insurance_expiration_date">Insurance Expiration Date</Label>
                  <Input id="insurance_expiration_date" name="insurance_expiration_date" type="date" defaultValue={editingTruck.insurance_expiration_date || ""} />
                </div>
                <div>
                  <Label htmlFor="oil_change_date">Oil Change Date</Label>
                  <Input id="oil_change_date" name="oil_change_date" type="date" defaultValue={editingTruck.oil_change_date || ""} />
                </div>
                <div>
                  <Label htmlFor="tires_swap_date">Tires Swap Date</Label>
                  <Input id="tires_swap_date" name="tires_swap_date" type="date" defaultValue={editingTruck.tires_swap_date || ""} />
                </div>
                <div>
                  <Label htmlFor="maintenance_check_date">Maintenance Check Date</Label>
                  <Input id="maintenance_check_date" name="maintenance_check_date" type="date" defaultValue={editingTruck.maintenance_check_date || ""} />
                </div>
              </div>
              <TruckFilesManager truckId={editingTruck.id} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditTruckDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Trailer Dialog */}
      <Dialog open={isEditTrailerDialogOpen} onOpenChange={setIsEditTrailerDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Trailer</DialogTitle>
          </DialogHeader>
          {editingTrailer && (
            <form onSubmit={handleEditTrailer} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="trailer_number">Trailer Number *</Label>
                  <Input id="trailer_number" name="trailer_number" defaultValue={editingTrailer.trailer_number} required />
                </div>
                <div>
                  <Label htmlFor="trailer_type">Trailer Type</Label>
                  <Select name="trailer_type" defaultValue={editingTrailer.trailer_type || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dry Van">Dry Van</SelectItem>
                      <SelectItem value="Reefer">Reefer</SelectItem>
                      <SelectItem value="Flatbed">Flatbed</SelectItem>
                      <SelectItem value="Step Deck">Step Deck</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="vin">VIN</Label>
                  <Input id="vin" name="vin" defaultValue={editingTrailer.vin || ""} />
                </div>
                <div>
                  <Label htmlFor="dot_inspection_date">DOT Inspection Date</Label>
                  <Input id="dot_inspection_date" name="dot_inspection_date" type="date" defaultValue={editingTrailer.dot_inspection_date || ""} />
                </div>
                <div>
                  <Label htmlFor="plate_expiration_date">Plate Expiration Date</Label>
                  <Input id="plate_expiration_date" name="plate_expiration_date" type="date" defaultValue={editingTrailer.plate_expiration_date || ""} />
                </div>
                <div>
                  <Label htmlFor="insurance_expiration_date">Insurance Expiration Date</Label>
                  <Input id="insurance_expiration_date" name="insurance_expiration_date" type="date" defaultValue={editingTrailer.insurance_expiration_date || ""} />
                </div>
              </div>
              <TrailerFilesManager trailerId={editingTrailer.id} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditTrailerDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Driver Dialog */}
      <Dialog open={isEditDriverDialogOpen} onOpenChange={setIsEditDriverDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Driver</DialogTitle>
          </DialogHeader>
          {editingDriver && (
            <form onSubmit={handleEditDriver} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Driver Name *</Label>
                  <Input id="name" name="name" defaultValue={editingDriver.name} required />
                </div>
                <div>
                  <Label htmlFor="cdl_expiration_date">CDL Expiration Date</Label>
                  <Input id="cdl_expiration_date" name="cdl_expiration_date" type="date" defaultValue={editingDriver.cdl_expiration_date || ""} />
                </div>
                <div>
                  <Label htmlFor="mvr_date">MVR Date</Label>
                  <Input id="mvr_date" name="mvr_date" type="date" defaultValue={editingDriver.mvr_date || ""} />
                </div>
                <div>
                  <Label htmlFor="clearing_house">Clearing House</Label>
                  <Input id="clearing_house" name="clearing_house" type="date" defaultValue={editingDriver.clearing_house || ""} />
                </div>
                <div>
                  <Label htmlFor="medical_card_expiration_date">Medical Card Expiration</Label>
                  <Input id="medical_card_expiration_date" name="medical_card_expiration_date" type="date" defaultValue={editingDriver.medical_card_expiration_date || ""} />
                </div>
                <div>
                  <Label htmlFor="random_drug_test_date">Random Drug Test</Label>
                  <Input id="random_drug_test_date" name="random_drug_test_date" type="date" defaultValue={editingDriver.random_drug_test_date || ""} />
                </div>
              </div>
              <DriverFilesManager driverId={editingDriver.id} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDriverDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Temporary Plate Dialog */}
      <Dialog open={isAddTempPlateDialogOpen} onOpenChange={setIsAddTempPlateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Truck to Temporary Plates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Truck</Label>
              <Combobox
                options={(allTrucks || [])
                  .filter(t => !temporaryPlates.some(p => p.truck_id === t.id))
                  .map(t => ({ value: t.id, label: t.truck_number }))}
                value={tempPlateTruckId}
                onValueChange={setTempPlateTruckId}
                placeholder="Search truck..."
                searchPlaceholder="Search truck number..."
                emptyText="No trucks found"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddTempPlateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddTemporaryPlate} disabled={!tempPlateTruckId || isAddingTempPlate}>
                {isAddingTempPlate ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
