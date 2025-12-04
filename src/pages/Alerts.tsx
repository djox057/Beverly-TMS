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
import { AlertTriangle, Truck, Package, User } from "lucide-react";
import { useExpiringTrucks, useExpiringTrailers, useExpiringDrivers } from "@/hooks/useExpiringAlerts";
import { useAuthContext } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useState } from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import { TruckFilesManager } from "@/components/TruckFilesManager";
import { TrailerFilesManager } from "@/components/TrailerFilesManager";
import { DriverFilesManager } from "@/components/DriverFilesManager";

const formatDate = (date: string | null) => {
  if (!date) return "N/A";
  return format(new Date(date), "MM/dd/yyyy");
};

const getExpirationStatus = (date: string | null) => {
  if (!date) return { variant: "secondary" as const, label: "No Date" };
  
  const expirationDate = new Date(date);
  const now = new Date();
  const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiration < 0) {
    return { variant: "destructive" as const, label: "Expired" };
  } else if (daysUntilExpiration <= 30) {
    return { variant: "destructive" as const, label: `${daysUntilExpiration} days` };
  } else {
    return { variant: "default" as const, label: `${daysUntilExpiration} days` };
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

  // Edit dialog states
  const [isEditTruckDialogOpen, setIsEditTruckDialogOpen] = useState(false);
  const [isEditTrailerDialogOpen, setIsEditTrailerDialogOpen] = useState(false);
  const [isEditDriverDialogOpen, setIsEditDriverDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<any>(null);
  const [editingTrailer, setEditingTrailer] = useState<any>(null);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination logic for trucks
  const trucksTotalPages = Math.ceil(trucks.length / itemsPerPage);
  const trucksStartIndex = (trucksPage - 1) * itemsPerPage;
  const trucksEndIndex = trucksStartIndex + itemsPerPage;
  const paginatedTrucks = trucks.slice(trucksStartIndex, trucksEndIndex);

  // Pagination logic for trailers
  const trailersTotalPages = Math.ceil(trailers.length / itemsPerPage);
  const trailersStartIndex = (trailersPage - 1) * itemsPerPage;
  const trailersEndIndex = trailersStartIndex + itemsPerPage;
  const paginatedTrailers = trailers.slice(trailersStartIndex, trailersEndIndex);

  // Pagination logic for drivers
  const driversTotalPages = Math.ceil(drivers.length / itemsPerPage);
  const driversStartIndex = (driversPage - 1) * itemsPerPage;
  const driversEndIndex = driversStartIndex + itemsPerPage;
  const paginatedDrivers = drivers.slice(driversStartIndex, driversEndIndex);

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
          <CardTitle>Items Expiring Within 60 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="trucks" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="trucks" className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Trucks ({trucks.length} total)
              </TabsTrigger>
              <TabsTrigger value="trailers" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Trailers ({trailers.length} total)
              </TabsTrigger>
              <TabsTrigger value="drivers" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Drivers ({drivers.length} total)
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Truck #</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>DOT Inspection</TableHead>
                      <TableHead>Plate Expiration</TableHead>
                      <TableHead>Insurance Expiration</TableHead>
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
                             {formatDate(truck.dot_inspection_date)}
                             {truck.dot_inspection_date && (
                               <Badge variant={getExpirationStatus(truck.dot_inspection_date).variant}>
                                 {getExpirationStatus(truck.dot_inspection_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(truck.plate_expiration_date)}
                             {truck.plate_expiration_date && (
                               <Badge variant={getExpirationStatus(truck.plate_expiration_date).variant}>
                                 {getExpirationStatus(truck.plate_expiration_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(truck.insurance_expiration_date)}
                             {truck.insurance_expiration_date && (
                               <Badge variant={getExpirationStatus(truck.insurance_expiration_date).variant}>
                                 {getExpirationStatus(truck.insurance_expiration_date).label}
                               </Badge>
                             )}
                           </div>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trailer #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>DOT Inspection</TableHead>
                      <TableHead>Plate Expiration</TableHead>
                      <TableHead>Insurance Expiration</TableHead>
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
                         <TableCell>{trailer.trailer_type || "N/A"}</TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(trailer.dot_inspection_date)}
                             {trailer.dot_inspection_date && (
                               <Badge variant={getExpirationStatus(trailer.dot_inspection_date).variant}>
                                 {getExpirationStatus(trailer.dot_inspection_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(trailer.plate_expiration_date)}
                             {trailer.plate_expiration_date && (
                               <Badge variant={getExpirationStatus(trailer.plate_expiration_date).variant}>
                                 {getExpirationStatus(trailer.plate_expiration_date).label}
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {formatDate(trailer.insurance_expiration_date)}
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver Name</TableHead>
                      <TableHead>CDL Expiration</TableHead>
                      <TableHead>MVR Date</TableHead>
                      <TableHead>Clearing House</TableHead>
                      <TableHead>Medical Card Exp</TableHead>
                      <TableHead>Random Drug Test</TableHead>
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
                               <Badge variant={getExpirationStatus(driver.random_drug_test_date).variant}>
                                 {getExpirationStatus(driver.random_drug_test_date).label}
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
    </div>
  );
}
