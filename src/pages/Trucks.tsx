import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { Search, Plus, Edit, Trash2, Loader2, History, Download, CheckCircle2, Play } from "lucide-react";
import * as XLSX from "xlsx";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useCompanies } from "@/hooks/useCompanies";
import { supabase } from "@/integrations/supabase/client";
import { useTrailers } from "@/hooks/useTrailers";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAuthContext } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TruckFilesManager } from "@/components/TruckFilesManager";
import { useQueryClient } from "@tanstack/react-query";
import { AssignmentHistoryDialog } from "@/components/AssignmentHistoryDialog";
import { AssignmentReasonDialog, AssignmentConflict } from "@/components/AssignmentReasonDialog";
import { Textarea } from "@/components/ui/textarea";

interface TruckFormData {
  truck_number: string;
  vin: string;
  plate: string;
  make: string;
  model: string;
  year: string;
  trailer_id: string;
  driver_id: string;
  driver2_id: string;
  ipass: string;
  dot_inspection_date: string;
  plate_expiration_date: string;
  insurance_expiration_date: string;
  oil_change_date: string;
  tires_swap_date: string;
  maintenance_check_date: string;
  company_id: string;
  dispatcher_id: string;
}

interface TerminationNote {
  id: string;
  note: string;
  created_at: string;
  created_by: string | null;
}

const ITEMS_PER_PAGE = 100;

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
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [showDoneConfirmation, setShowDoneConfirmation] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [terminationNote, setTerminationNote] = useState("");
  const [terminationNotes, setTerminationNotes] = useState<TerminationNote[]>([]);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [reasonChangeType, setReasonChangeType] = useState<"driver" | "trailer" | "both">("driver");
  const [pendingReason, setPendingReason] = useState<string>("");
  const [assignmentConflicts, setAssignmentConflicts] = useState<Array<{ type: "driver" | "trailer"; name: string; currentTruck: string }>>([]);
  const originalAssignmentRef = useRef<{ driver_id: string; driver2_id: string; trailer_id: string } | null>(null);
  const [formData, setFormData] = useState<TruckFormData>({
    truck_number: "",
    vin: "",
    plate: "",
    make: "",
    model: "",
    year: "",
    trailer_id: "",
    driver_id: "",
    driver2_id: "",
    ipass: "",
    dot_inspection_date: "",
    plate_expiration_date: "",
    insurance_expiration_date: "",
    oil_change_date: "",
    tires_swap_date: "",
    maintenance_check_date: "",
    company_id: "",
    dispatcher_id: ""
  });
  const { user } = useAuth();
  const { hasRole } = useAuthContext();
  const canDelete = hasRole('admin') || hasRole('manager') || hasRole('safety') || hasRole('maintenance');
  const queryClient = useQueryClient();
  const {
    data: trucks,
    isLoading,
    refetch
  } = useTrucks();
  
  // Invalidate on mount to ensure fresh data (don't remove queries - causes race with realtime)
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['trucks', 'v2'] });
  }, []); // Only on mount
  
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

  // Filter trucks based on search term, company filter, assignment filter, and status filter
  const filteredTrucks = useMemo(() => {
    return trucks?.filter(truck => {
      // Search filter
      const matchesSearch = truck.truck_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
        truck.vin?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        truck.plate?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        truck.dispatcher?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        truck.dispatcher?.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        truck.driver1?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        truck.driver2?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        truck.trailer?.trailer_number?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Company filter - filter by driver's company
      const driverCompanyId = truck.driver1?.company_id;
      const matchesCompany = companyFilter === "all" || driverCompanyId === companyFilter;
      
      // Assignment filter - filter by driver1 assignment status
      const matchesAssignment = assignmentFilter === "all" || 
        (assignmentFilter === "assigned" && truck.driver1_id) || 
        (assignmentFilter === "unassigned" && !truck.driver1_id);
      
      // Status filter - filter by is_active status
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "active" && truck.is_active !== false) || 
        (statusFilter === "inactive" && truck.is_active === false);
      
      return matchesSearch && matchesCompany && matchesAssignment && matchesStatus;
    }) || [];
  }, [trucks, searchTerm, companyFilter, assignmentFilter, statusFilter]);

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
      plate: "",
      make: "",
      model: "",
      year: "",
      trailer_id: "",
      driver_id: "",
      driver2_id: "",
      ipass: "",
      dot_inspection_date: "",
      plate_expiration_date: "",
      insurance_expiration_date: "",
      oil_change_date: "",
      tires_swap_date: "",
      maintenance_check_date: "",
      company_id: "",
      dispatcher_id: ""
    });
  };
  const handleAddTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Remove trailer from any other truck if already assigned
      if (formData.trailer_id) {
        await supabase.from('trucks')
          .update({ trailer_id: null })
          .eq('trailer_id', formData.trailer_id);
      }

      // Get driver's company_id to set on truck (truck inherits driver's company)
      let truckCompanyId: string | null = formData.company_id || null;
      let truckDispatcherId: string | null = formData.dispatcher_id || null;
      if (formData.driver_id) {
        const driver = drivers?.find(d => d.id === formData.driver_id);
        truckCompanyId = driver?.company_id || truckCompanyId;
        truckDispatcherId = driver?.dispatcher_id || truckDispatcherId;
      }

      // ATOMIC OPERATION: Insert the truck with driver assignments
      const {
        error
      } = await supabase.from('trucks').insert({
        truck_number: formData.truck_number?.trim(),
        vin: formData.vin || null,
        plate: formData.plate || null,
        make: formData.make || null,
        model: formData.model || null,
        year: formData.year ? parseInt(formData.year, 10) : null,
        trailer_id: formData.trailer_id || null,
        driver1_id: formData.driver_id || null,
        driver2_id: formData.driver2_id || null,
        company_id: truckCompanyId,
        dispatcher_id: truckDispatcherId,
        ipass: formData.ipass || null,
        dot_inspection_date: formData.dot_inspection_date || null,
        plate_expiration_date: formData.plate_expiration_date || null,
        insurance_expiration_date: formData.insurance_expiration_date || null,
        oil_change_date: formData.oil_change_date || null,
        tires_swap_date: formData.tires_swap_date || null,
        maintenance_check_date: formData.maintenance_check_date || null
      });
      if (error) throw error;

      // Now safely remove drivers from any other trucks (after successful insert)
      if (formData.driver_id) {
        await supabase.from('trucks')
          .update({ driver1_id: null })
          .eq('driver1_id', formData.driver_id)
          .neq('truck_number', formData.truck_number);
        await supabase.from('trucks')
          .update({ driver2_id: null })
          .eq('driver2_id', formData.driver_id)
          .neq('truck_number', formData.truck_number);
      }
      if (formData.driver2_id) {
        await supabase.from('trucks')
          .update({ driver1_id: null })
          .eq('driver1_id', formData.driver2_id)
          .neq('truck_number', formData.truck_number);
        await supabase.from('trucks')
          .update({ driver2_id: null })
          .eq('driver2_id', formData.driver2_id)
          .neq('truck_number', formData.truck_number);
      }

      toast.success("Truck added successfully");
      resetForm();
      setIsAddDialogOpen(false);
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    } catch (error: any) {
      toast.error(error.message || "Failed to add truck");
    } finally {
      setIsSubmitting(false);
    }
  };
  // Check if assignment change needs a reason
  const checkAssignmentChangeNeedsReason = (): "driver" | "trailer" | "both" | null => {
    if (!originalAssignmentRef.current) return null;
    
    const orig = originalAssignmentRef.current;
    
    // Check if driver1 or driver2 changed (only if original had a value)
    const driver1Changed = orig.driver_id && orig.driver_id !== formData.driver_id;
    const driver2Changed = orig.driver2_id && orig.driver2_id !== formData.driver2_id;
    const driverChanged = driver1Changed || driver2Changed;
    
    // Check if trailer changed (only if original had a value)
    const trailerChanged = orig.trailer_id && orig.trailer_id !== formData.trailer_id;
    
    if (driverChanged && trailerChanged) return "both";
    if (driverChanged) return "driver";
    if (trailerChanged) return "trailer";
    return null;
  };

  // Check for conflicts with existing truck assignments
  const checkAssignmentConflicts = (): AssignmentConflict[] => {
    if (!editingTruck) return [];
    const conflicts: AssignmentConflict[] = [];
    
    // Check driver1 conflict
    if (formData.driver_id) {
      const conflictTruck = trucks?.find(t => 
        t.id !== editingTruck.id && 
        (t.driver1_id === formData.driver_id || t.driver2_id === formData.driver_id)
      );
      if (conflictTruck) {
        const driver = drivers?.find(d => d.id === formData.driver_id);
        conflicts.push({
          type: "driver",
          name: driver?.name || "Unknown",
          currentTruck: conflictTruck.truck_number
        });
      }
    }
    
    // Check driver2 conflict
    if (formData.driver2_id) {
      const conflictTruck = trucks?.find(t => 
        t.id !== editingTruck.id && 
        (t.driver1_id === formData.driver2_id || t.driver2_id === formData.driver2_id)
      );
      if (conflictTruck) {
        const driver = drivers?.find(d => d.id === formData.driver2_id);
        // Only add if not already added for driver1
        const alreadyAdded = conflicts.some(c => c.name === driver?.name);
        if (!alreadyAdded) {
          conflicts.push({
            type: "driver",
            name: driver?.name || "Unknown",
            currentTruck: conflictTruck.truck_number
          });
        }
      }
    }
    
    // Check trailer conflict
    if (formData.trailer_id) {
      const conflictTruck = trucks?.find(t => 
        t.id !== editingTruck.id && 
        t.trailer_id === formData.trailer_id
      );
      if (conflictTruck) {
        const trailer = trailers?.find(tr => tr.id === formData.trailer_id);
        conflicts.push({
          type: "trailer",
          name: trailer?.trailer_number || "Unknown",
          currentTruck: conflictTruck.truck_number
        });
      }
    }
    
    return conflicts;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const changeType = checkAssignmentChangeNeedsReason();
    const conflicts = checkAssignmentConflicts();
    
    if (changeType) {
      setReasonChangeType(changeType);
      setAssignmentConflicts(conflicts);
      setShowReasonDialog(true);
    } else if (conflicts.length > 0) {
      // Even if no reason needed, show dialog for conflicts
      setReasonChangeType("driver"); // Default type
      setAssignmentConflicts(conflicts);
      setShowReasonDialog(true);
    } else {
      handleEditTruckWithReason("");
    }
  };

  const handleReasonConfirm = (reason: string) => {
    setPendingReason(reason);
    setShowReasonDialog(false);
    handleEditTruckWithReason(reason);
  };

  const handleReasonCancel = () => {
    setShowReasonDialog(false);
    // Reset form data to original values
    if (originalAssignmentRef.current) {
      setFormData(prev => ({
        ...prev,
        driver_id: originalAssignmentRef.current!.driver_id,
        driver2_id: originalAssignmentRef.current!.driver2_id,
        trailer_id: originalAssignmentRef.current!.trailer_id
      }));
    }
  };

  const handleEditTruckWithReason = async (reason: string) => {
    if (!editingTruck) return;
    setIsSubmitting(true);
    try {
      // Remove trailer from any other truck if already assigned (excluding current truck)
      if (formData.trailer_id) {
        await supabase.from('trucks')
          .update({ trailer_id: null })
          .eq('trailer_id', formData.trailer_id)
          .neq('id', editingTruck.id);
      }

      // Get driver's company_id to set on truck (truck inherits driver's company)
      let truckCompanyId: string | null = formData.company_id || null;
      let truckDispatcherId: string | null = formData.dispatcher_id || null;
      if (formData.driver_id) {
        const driver = drivers?.find(d => d.id === formData.driver_id);
        truckCompanyId = driver?.company_id || truckCompanyId;
        truckDispatcherId = driver?.dispatcher_id || truckDispatcherId;
      }

      // ATOMIC OPERATION: Update the truck with new driver assignments FIRST
      const {
        error
      } = await supabase.from('trucks').update({
        truck_number: formData.truck_number,
        vin: formData.vin || null,
        plate: formData.plate || null,
        make: formData.make || null,
        model: formData.model || null,
        year: formData.year ? parseInt(formData.year, 10) : null,
        trailer_id: formData.trailer_id || null,
        driver1_id: formData.driver_id || null,
        driver2_id: formData.driver2_id || null,
        company_id: truckCompanyId,
        dispatcher_id: truckDispatcherId,
        ipass: formData.ipass || null,
        dot_inspection_date: formData.dot_inspection_date || null,
        plate_expiration_date: formData.plate_expiration_date || null,
        insurance_expiration_date: formData.insurance_expiration_date || null,
        oil_change_date: formData.oil_change_date || null,
        tires_swap_date: formData.tires_swap_date || null,
        maintenance_check_date: formData.maintenance_check_date || null
      }).eq('id', editingTruck.id);
      if (error) throw error;

      // Log assignment history if there was a change
      // HARDENED: Include old_ values for accurate "from → to" display
      // Note: DB trigger also captures changes as safety net, but app code provides reason
      if (originalAssignmentRef.current && reason) {
        const orig = originalAssignmentRef.current;
        const driverChanged = (orig.driver_id && orig.driver_id !== formData.driver_id) ||
                             (orig.driver2_id && orig.driver2_id !== formData.driver2_id);
        const trailerChanged = orig.trailer_id && orig.trailer_id !== formData.trailer_id;
        
        let changeType = 'assignment_change';
        if (driverChanged && !trailerChanged) changeType = 'driver_assignment';
        if (trailerChanged && !driverChanged) changeType = 'trailer_assignment';
        
        await supabase.from('assignment_history').insert({
          truck_id: editingTruck.id,
          trailer_id: formData.trailer_id || null,
          driver1_id: formData.driver_id || null,
          driver2_id: formData.driver2_id || null,
          // HARDENED: Include old values for deterministic display
          old_truck_id: editingTruck.id, // Same truck, different assignments
          old_trailer_id: orig.trailer_id || null,
          old_driver1_id: orig.driver_id || null,
          old_driver2_id: orig.driver2_id || null,
          change_type: changeType,
          reason: reason,
          changed_by: user?.id
        });
      }

      // Now safely remove drivers from any other trucks (excluding current truck)
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

      toast.success("Truck updated successfully");
      resetForm();
      setIsEditDialogOpen(false);
      setEditingTruck(null);
      originalAssignmentRef.current = null;
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update truck");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keep old handleEditTruck for the form onSubmit wrapper
  const handleEditTruck = handleFormSubmit;
  const handleDeleteTruck = async (truckId: string) => {
    try {
      // Get truck data to save to history
      const { data: truckData, error: fetchError } = await supabase
        .from('trucks')
        .select('*')
        .eq('id', truckId)
        .single();
      
      if (fetchError) throw fetchError;

      // Save truck number to orders and nullify truck_id before deletion
      await supabase
        .from('orders')
        .update({ deleted_truck_number: truckData.truck_number, truck_id: null })
        .eq('truck_id', truckId);

      // Get driver's company_id for archival (use driver1's company, not truck's company)
      let driverCompanyId = null;
      if (truckData.driver1_id) {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('company_id')
          .eq('id', truckData.driver1_id)
          .maybeSingle();
        driverCompanyId = driverData?.company_id;
      }

      // Save to deleted_trucks history table
      const { error: historyError } = await supabase
        .from('deleted_trucks')
        .insert({
          id: truckData.id,
          truck_number: truckData.truck_number,
          vin: truckData.vin,
          model: truckData.model,
          truck_type: truckData.truck_type,
          ipass: truckData.ipass,
          dot_inspection_date: truckData.dot_inspection_date,
          plate_expiration_date: truckData.plate_expiration_date,
          insurance_expiration_date: truckData.insurance_expiration_date,
          status: truckData.status,
          company_id: driverCompanyId,
          dispatcher_id: truckData.dispatcher_id,
          deleted_by: user?.id
        });
      
      if (historyError) throw historyError;

      // Nullify original_truck_id references in orders
      await supabase
        .from('orders')
        .update({ original_truck_id: null })
        .eq('original_truck_id', truckId);

      // Delete from trucks (orders.truck_id becomes NULL via FK, but deleted_truck_number is preserved)
      const { error } = await supabase.from('trucks').delete().eq('id', truckId);
      if (error) throw error;
      
      toast.success("Truck deleted and archived successfully");
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete truck");
    }
  };
  const openEditDialog = async (truck: any) => {
    setEditingTruck(truck);
    setFormData({
      truck_number: truck.truck_number || "",
      vin: truck.vin || "",
      plate: truck.plate || "",
      make: truck.make || "",
      model: truck.model || "",
      year: truck.year ? String(truck.year) : "",
      trailer_id: truck.trailer_id || "",
      driver_id: truck.driver1_id || "",
      driver2_id: truck.driver2_id || "",
      ipass: truck.ipass || "",
      dot_inspection_date: truck.dot_inspection_date || "",
      plate_expiration_date: truck.plate_expiration_date || "",
      insurance_expiration_date: truck.insurance_expiration_date || "",
      oil_change_date: truck.oil_change_date || "",
      tires_swap_date: truck.tires_swap_date || "",
      maintenance_check_date: truck.maintenance_check_date || "",
      company_id: truck.company_id || "",
      dispatcher_id: truck.dispatcher_id || ""
    });
    
    // Store original assignments for comparison
    originalAssignmentRef.current = {
      driver_id: truck.driver1_id || "",
      driver2_id: truck.driver2_id || "",
      trailer_id: truck.trailer_id || ""
    };
    
    // Fetch termination notes if truck is inactive
    if (truck.is_active === false) {
      const { data: notes } = await supabase
        .from('truck_termination_notes')
        .select('*')
        .eq('truck_id', truck.id)
        .order('created_at', { ascending: false });
      setTerminationNotes(notes || []);
    } else {
      setTerminationNotes([]);
    }
    
    setIsEditDialogOpen(true);
  };

  // Done functionality - mark truck as inactive
  const handleDoneClick = () => {
    setShowDoneConfirmation(true);
  };

  const handleConfirmDone = () => {
    setShowDoneConfirmation(false);
    setShowNoteDialog(true);
  };

  const handleSaveTerminationNote = async () => {
    if (!editingTruck || !terminationNote.trim()) return;
    
    setIsSubmitting(true);
    try {
      // Save termination note
      const { error: noteError } = await supabase
        .from('truck_termination_notes')
        .insert({
          truck_id: editingTruck.id,
          note: terminationNote.trim(),
          created_by: user?.id
        });
      
      if (noteError) throw noteError;
      
      // Update truck: set is_active = false, termination_date = today, clear assignments
      const { error: updateError } = await supabase
        .from('trucks')
        .update({
          is_active: false,
          termination_date: new Date().toISOString().split('T')[0],
          driver1_id: null,
          driver2_id: null,
          trailer_id: null
        })
        .eq('id', editingTruck.id);
      
      if (updateError) throw updateError;
      
      toast.success(`Truck ${editingTruck.truck_number} marked as done`);
      
      setShowNoteDialog(false);
      setTerminationNote("");
      setIsEditDialogOpen(false);
      setEditingTruck(null);
      
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    } catch (error: any) {
      toast.error(error.message || "Failed to mark truck as done");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start functionality - reactivate truck
  const handleStartTruck = async () => {
    if (!editingTruck) return;
    
    setIsSubmitting(true);
    try {
      // Delete all termination notes
      await supabase
        .from('truck_termination_notes')
        .delete()
        .eq('truck_id', editingTruck.id);
      
      // Update truck: set is_active = true, clear termination_date
      const { error: updateError } = await supabase
        .from('trucks')
        .update({
          is_active: true,
          termination_date: null
        })
        .eq('id', editingTruck.id);
      
      if (updateError) throw updateError;
      
      toast.success(`Truck ${editingTruck.truck_number} reactivated`);
      
      // Clear local state
      setTerminationNotes([]);
      setIsEditDialogOpen(false);
      setEditingTruck(null);
      
      // Use correct query key matching useTrucks hook
      queryClient.invalidateQueries({ queryKey: ['trucks', 'v2'] });
    } catch (error: any) {
      toast.error(error.message || "Failed to reactivate truck");
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredTrucks.map(truck => ({
      "Truck #": truck.truck_number,
      "VIN": truck.vin || "",
      "Company": truck.driver1?.company?.name || "",
      "Trailer #": truck.trailer?.trailer_number || "",
      "Driver 1": truck.driver1?.name || "",
      "Driver 2": truck.driver2?.name || "",
      "Dispatcher": truck.dispatcher?.full_name || "",
      "IPASS": truck.ipass || "",
      "DOT Inspection": truck.dot_inspection_date || "",
      "Plate Exp.": truck.plate_expiration_date || "",
      "Insurance Exp.": truck.insurance_expiration_date || ""
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trucks");
    XLSX.writeFile(wb, `trucks_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast.success(`Exported ${exportData.length} trucks to Excel`);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
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

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="make">Make</Label>
                  <Input id="make" value={formData.make} onChange={e => setFormData({ ...formData, make: e.target.value })} placeholder="Freightliner" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} placeholder="Cascadia" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: e.target.value })} placeholder="2022" />
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

              <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label htmlFor="plate">Plate</Label>
                  <Input id="plate" value={formData.plate} onChange={e => setFormData({
                    ...formData,
                    plate: e.target.value
                  })} placeholder="Enter plate number" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company_id">Company</Label>
                  <Combobox
                    options={companyOptions}
                    value={formData.company_id}
                    onValueChange={value => setFormData({ ...formData, company_id: value })}
                    placeholder="Select company"
                    searchPlaceholder="Search companies..."
                    emptyText="No company found."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dispatcher_id">Dispatcher</Label>
                  <Combobox
                    options={dispatcherOptions}
                    value={formData.dispatcher_id}
                    onValueChange={value => setFormData({ ...formData, dispatcher_id: value })}
                    placeholder="Select dispatcher"
                    searchPlaceholder="Search dispatchers..."
                    emptyText="No dispatcher found."
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

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="oil_change_date">Oil Change Date</Label>
                  <Input id="oil_change_date" type="date" value={formData.oil_change_date} onChange={e => setFormData({
                  ...formData,
                  oil_change_date: e.target.value
                })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tires_swap_date">Tires Swap Date</Label>
                  <Input id="tires_swap_date" type="date" value={formData.tires_swap_date} onChange={e => setFormData({
                  ...formData,
                  tires_swap_date: e.target.value
                })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenance_check_date">Maintenance Check Date</Label>
                  <Input id="maintenance_check_date" type="date" value={formData.maintenance_check_date} onChange={e => setFormData({
                  ...formData,
                  maintenance_check_date: e.target.value
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
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Truck Fleet</CardTitle>
            <div className="flex items-center gap-3">
              <div className="w-[140px]">
                <Combobox
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                    { value: "all", label: "All Status" }
                  ]}
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value);
                    setCurrentPage(1);
                  }}
                  placeholder="Status"
                  searchPlaceholder="Search..."
                  emptyText="No option found."
                />
              </div>
              <div className="w-[160px]">
                <Combobox
                  options={[
                    { value: "all", label: "All Trucks" },
                    { value: "assigned", label: "Assigned" },
                    { value: "unassigned", label: "Unassigned" }
                  ]}
                  value={assignmentFilter}
                  onValueChange={(value) => {
                    setAssignmentFilter(value);
                    setCurrentPage(1);
                  }}
                  placeholder="Assignment"
                  searchPlaceholder="Search..."
                  emptyText="No option found."
                />
              </div>
              <div className="w-[160px]">
                <Combobox
                  options={[
                    { value: "all", label: "All Companies" },
                    ...(companies?.map(company => ({
                      value: company.id,
                      label: company.name
                    })) || [])
                  ]}
                  value={companyFilter}
                  onValueChange={(value) => {
                    setCompanyFilter(value);
                    setCurrentPage(1);
                  }}
                  placeholder="Company"
                  searchPlaceholder="Search companies..."
                  emptyText="No company found."
                />
              </div>
              <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="Search trucks..." className="pl-10" value={searchTerm} onChange={e => handleSearchChange(e.target.value)} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col">
          <div className="flex-1">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center w-[70px]">Truck #</TableHead>
                  <TableHead className="text-center w-[180px]">VIN</TableHead>
                  <TableHead className="text-center w-[140px]">Company</TableHead>
                  <TableHead className="text-center w-[80px]">Trailer #</TableHead>
                  <TableHead className="text-center w-[120px]">Driver 1</TableHead>
                  <TableHead className="text-center w-[120px]">Driver 2</TableHead>
                  <TableHead className="text-center w-[150px]">Dispatcher</TableHead>
                  <TableHead className="text-center w-[90px]">IPASS</TableHead>
                  <TableHead className="text-center w-[95px]">DOT Inspection</TableHead>
                  <TableHead className="text-center w-[85px]">Plate Exp.</TableHead>
                  <TableHead className="text-center w-[95px]">Insurance Exp.</TableHead>
                  <TableHead className="text-center w-[140px]">Actions</TableHead>
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
                        <TableCell className="font-medium text-center whitespace-nowrap">{truck.truck_number}</TableCell>
                        <TableCell className="font-mono text-sm text-center whitespace-nowrap">{truck.vin || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          {truck.driver1?.company?.name 
                            ? truck.driver1.company.name
                                .replace(/\s+(LLC|Inc\.?|INC|Corporation|Corp\.?)$/i, '')
                                .replace(/\s+Solutions$/i, '')
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">{truck.trailer?.trailer_number || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{truck.driver1?.name || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{truck.driver2?.name || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{truck.dispatcher?.full_name || truck.dispatcher?.email || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          {truck.ipass ? (
                            <span 
                              className="cursor-pointer hover:text-primary"
                              title={`Click to copy: ${truck.ipass}`}
                              onClick={() => {
                                navigator.clipboard.writeText(truck.ipass || '');
                                toast.success('IPASS copied to clipboard');
                              }}
                            >
                              {truck.ipass.length > 10 ? truck.ipass.slice(0, 10) + '…' : truck.ipass}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">{truck.dot_inspection_date || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{truck.plate_expiration_date || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{truck.insurance_expiration_date || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">
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
                            )}
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

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_make">Make</Label>
                    <Input id="edit_make" value={formData.make} onChange={e => setFormData({ ...formData, make: e.target.value })} placeholder="Freightliner" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_model">Model</Label>
                    <Input id="edit_model" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} placeholder="Cascadia" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_year">Year</Label>
                    <Input id="edit_year" type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: e.target.value })} placeholder="2022" />
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

                <div className="grid grid-cols-2 gap-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="edit_plate">Plate</Label>
                    <Input id="edit_plate" value={formData.plate} onChange={e => setFormData({
                      ...formData,
                      plate: e.target.value
                    })} placeholder="Enter plate number" />
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

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_oil_change_date">Oil Change Date</Label>
                    <Input id="edit_oil_change_date" type="date" value={formData.oil_change_date} onChange={e => setFormData({
                    ...formData,
                    oil_change_date: e.target.value
                  })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_tires_swap_date">Tires Swap Date</Label>
                    <Input id="edit_tires_swap_date" type="date" value={formData.tires_swap_date} onChange={e => setFormData({
                    ...formData,
                    tires_swap_date: e.target.value
                  })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_maintenance_check_date">Maintenance Check Date</Label>
                    <Input id="edit_maintenance_check_date" type="date" value={formData.maintenance_check_date} onChange={e => setFormData({
                    ...formData,
                    maintenance_check_date: e.target.value
                  })} />
                  </div>
                </div>

                {/* Termination notes section for inactive trucks */}
                {editingTruck?.is_active === false && terminationNotes.length > 0 && (
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
                    {canDelete && editingTruck?.is_active !== false && (
                      <Button 
                        type="button" 
                        variant="destructive" 
                        onClick={handleDoneClick}
                        disabled={isSubmitting}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Done
                      </Button>
                    )}
                    {canDelete && editingTruck?.is_active === false && (
                      <Button 
                        type="button" 
                        variant="default" 
                        onClick={handleStartTruck}
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-700"
                      >
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
                      Update Truck
                    </Button>
                  </div>
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

      {/* Done Confirmation Dialog */}
      <AlertDialog open={showDoneConfirmation} onOpenChange={setShowDoneConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Truck as Done?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark truck {editingTruck?.truck_number} as inactive and clear all driver and trailer assignments.
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
              <Label>Note for truck {editingTruck?.truck_number}</Label>
              <Textarea
                value={terminationNote}
                onChange={(e) => setTerminationNote(e.target.value)}
                placeholder="Enter reason for marking this truck as done..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveTerminationNote} 
              disabled={isSubmitting || !terminationNote.trim()}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Mark Done
            </Button>
          </DialogFooter>
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

      {/* Assignment Reason Dialog */}
      <AssignmentReasonDialog
        open={showReasonDialog}
        onOpenChange={setShowReasonDialog}
        changeType={reasonChangeType}
        onConfirm={handleReasonConfirm}
        onCancel={handleReasonCancel}
        conflicts={assignmentConflicts}
      />
    </div>;
};
export default Trucks;