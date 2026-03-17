import { useState, useEffect, useRef } from "react";
import { isValidUUID } from "@/utils/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { Loader2, CheckCircle2, Play, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriverFilesManager } from "@/components/DriverFilesManager";
import { useAuthContext } from "@/contexts/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/hooks/useCompanies";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { formatPhoneNumber } from "@/lib/utils";
import { AssignmentReasonDialog } from "@/components/AssignmentReasonDialog";

interface DriverFormData {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  company_id: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
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
  company_name: string;
  company_address: string;
  mc_number: string;
  weekly_payment: string;
  weeks_count: string;
  agreement_start_date: string;
  cdl_number: string;
  cdl_expiration_date: string;
  medical_card_expiration_date: string;
  random_drug_test_date: string;
  hire_date: string;
  termination_date: string;
  mvr_date: string;
  clearing_house: string;
  ssn: string;
  fein: string;
  is_company_driver: boolean;
  is_recovery: boolean;
  do_not_touch_hos: boolean;
  hazmat: boolean;
  tanker: boolean;
  twic: boolean;
  citizen: boolean;
  criminal: boolean;
  cents_per_mile: string;
  note: string;
}

interface EditDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: any;
  onSuccess?: () => void;
}

export function EditDriverDialog({ open, onOpenChange, driver, onSuccess }: EditDriverDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole, profile } = useAuthContext();
  const canViewSensitiveData = hasRole("manager") || hasRole("admin") || hasRole("accounting");
  const { allDispatchers } = useFleetManagement();
  const { data: companies } = useCompanies();
  const { data: allTrucks } = useAvailableTrucks();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");
  const [showDoneConfirmation, setShowDoneConfirmation] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [terminationNote, setTerminationNote] = useState("");
  const [twoWeekNoticeDialog, setTwoWeekNoticeDialog] = useState(false);
  const [twoWeekNoticeDate, setTwoWeekNoticeDate] = useState<Date | undefined>(new Date());
  const [terminationNotes, setTerminationNotes] = useState<any[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  
  // Track original assignment for detecting changes - use ref for synchronous access
  const originalAssignmentRef = useRef<{ truckId: string | null; trailerId: string | null }>({
    truckId: null,
    trailerId: null,
  });
  
  // Assignment reason dialog state
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [pendingReasonType, setPendingReasonType] = useState<"truck" | "trailer" | "both">("truck");
  
  // Already assigned warning dialog state
  const [showAlreadyAssignedWarning, setShowAlreadyAssignedWarning] = useState(false);
  const [alreadyAssignedInfo, setAlreadyAssignedInfo] = useState<{
    truckDriverName?: string;
    trailerDriverName?: string;
    truckNumber?: string;
    trailerNumber?: string;
  } | null>(null);

  const { data: availableTrailers } = useAvailableTrailers(selectedTruckId || "");

  const [formData, setFormData] = useState<DriverFormData>({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    company_id: "",
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emergency_contact_phone: "",
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
    company_name: "",
    company_address: "",
    mc_number: "",
    weekly_payment: "",
    weeks_count: "",
    agreement_start_date: "",
    cdl_number: "",
    cdl_expiration_date: "",
    medical_card_expiration_date: "",
    random_drug_test_date: "",
    hire_date: "",
    termination_date: "",
    mvr_date: "",
    clearing_house: "",
    ssn: "",
    fein: "",
    is_company_driver: false,
    is_recovery: false,
    do_not_touch_hos: false,
    hazmat: false,
    tanker: false,
    twic: false,
    citizen: true,
    criminal: false,
    cents_per_mile: "",
    note: "",
  });

  // Get available trucks (excluding ones assigned to other drivers)
  const editingDriverTruckId = editingDriver
    ? allTrucks?.find((truck) => truck.driver1_id === editingDriver.id)?.id
    : null;

  const availableTrucks =
    allTrucks?.filter((truck) => {
      if (editingDriver && truck.id === editingDriverTruckId) {
        return true;
      }
      return !truck.driver1_id;
    }) || [];

  const fetchTerminationNotes = async (driverId: string) => {
    setIsLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from("driver_termination_notes")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Fetch creator names for notes with created_by
      const allCreatorIds = [...new Set((data || []).map(n => n.created_by).filter(Boolean))] as string[];
      const creatorIds = allCreatorIds.filter(isValidUUID);
      if (creatorIds.length < allCreatorIds.length) {
        console.warn(`[EditDriverDialog] Filtered ${allCreatorIds.length - creatorIds.length} invalid UUIDs from created_by`);
      }
      let creatorsMap: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", creatorIds);
        creatorsMap = (profiles || []).reduce((acc, p) => {
          if (p.user_id && p.full_name) acc[p.user_id] = p.full_name;
          return acc;
        }, {} as Record<string, string>);
      }
      
      const notesWithCreators = (data || []).map(note => ({
        ...note,
        creator_name: note.created_by ? creatorsMap[note.created_by] || null : null,
      }));
      setTerminationNotes(notesWithCreators);
    } catch (error) {
      console.error("Error fetching termination notes:", error);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  // Load driver data when dialog opens
  useEffect(() => {
    if (open && driver) {
      loadDriverData(driver);
    } else if (!open) {
      // Reset original assignment tracking when dialog closes
      originalAssignmentRef.current = { truckId: null, trailerId: null };
    }
  }, [open, driver]);

  const loadDriverData = async (driver: any) => {
    setEditingDriver(driver);
    fetchTerminationNotes(driver.id);

    const { data: truckData, error: truckError } = await supabase
      .from("trucks")
      .select("id, trailer_id")
      .or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id}`)
      .limit(1)
      .maybeSingle();

    if (truckError) {
      console.error("Error loading driver truck assignment:", truckError);
    }

    // Store original assignment for detecting changes (using ref for synchronous access)
    originalAssignmentRef.current = {
      truckId: truckData?.id ?? null,
      trailerId: truckData?.trailer_id ?? null,
    };

    let sensitivePIIData = null;
    if (canViewSensitiveData) {
      const { data } = await supabase.from("driver_sensitive_pii").select("*").eq("driver_id", driver.id).maybeSingle();
      sensitivePIIData = data;
    }

    setFormData({
      first_name: driver.first_name || "",
      last_name: driver.last_name || "",
      phone: formatPhoneNumber(driver.phone || ""),
      email: driver.email || "",
      company_id: driver.company_id || "",
      emergency_contact_name: driver.emergency_contact_name || "",
      emergency_contact_relation: driver.emergency_contact_relation || "",
      emergency_contact_phone: formatPhoneNumber(driver.emergency_contact_phone || ""),
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
      company_name: driver.company_name || "",
      company_address: driver.company_address || "",
      mc_number: driver.mc_number || "",
      weekly_payment: driver.weekly_payment?.toString() || "",
      weeks_count: driver.weeks_count?.toString() || "",
      agreement_start_date: driver.agreement_start_date || "",
      cdl_number: driver.cdl_number || "",
      cdl_expiration_date: driver.cdl_expiration_date || "",
      medical_card_expiration_date: driver.medical_card_expiration_date || "",
      random_drug_test_date: driver.random_drug_test_date || "",
      hire_date: driver.hire_date || "",
      termination_date: driver.termination_date || "",
      mvr_date: driver.mvr_date || "",
      clearing_house: driver.clearing_house || "",
      ssn: sensitivePIIData?.ssn || "",
      fein: sensitivePIIData?.fein || "",
      is_company_driver: driver.is_company_driver || false,
      is_recovery: driver.is_recovery || false,
      do_not_touch_hos: driver.do_not_touch_hos || false,
      hazmat: driver.hazmat || false,
      tanker: driver.tanker || false,
      twic: driver.twic || false,
      citizen: driver.citizen !== false,
      criminal: driver.criminal || false,
      cents_per_mile: driver.cents_per_mile?.toString() || "",
      note: driver.note || "",
    });

    if (truckData?.id) {
      setSelectedTruckId(truckData.id);
    }
  };

  // Check if assignment change requires a reason
  const checkAssignmentChangeNeedsReason = (): "truck" | "trailer" | "both" | null => {
    const { truckId: origTruckId, trailerId: origTrailerId } = originalAssignmentRef.current;
    
    // Normalize to null for empty strings
    const newTruckId = formData.truck_id && formData.truck_id.trim() !== "" ? formData.truck_id : null;
    const newTrailerId = formData.trailer_id && formData.trailer_id.trim() !== "" ? formData.trailer_id : null;
    const origTruck = origTruckId && origTruckId.trim() !== "" ? origTruckId : null;
    const origTrailer = origTrailerId && origTrailerId.trim() !== "" ? origTrailerId : null;
    
    const truckChanged = newTruckId !== origTruck;
    const trailerChanged = newTrailerId !== origTrailer;
    
    // Only require reason if there was a previous assignment (not null/empty)
    const hadTruck = origTruck !== null;
    const hadTrailer = origTrailer !== null;
    
    console.log("Assignment check:", { 
      newTruckId, origTruck, truckChanged, hadTruck,
      newTrailerId, origTrailer, trailerChanged, hadTrailer 
    });
    
    if (truckChanged && hadTruck && trailerChanged && hadTrailer) {
      return "both";
    } else if (truckChanged && hadTruck) {
      return "truck";
    } else if (trailerChanged && hadTrailer) {
      return "trailer";
    }
    return null;
  };

  // Check if truck/trailer is already assigned to another driver
  const checkAlreadyAssigned = async (): Promise<{
    truckDriverName?: string;
    trailerDriverName?: string;
    truckNumber?: string;
    trailerNumber?: string;
  } | null> => {
    const result: {
      truckDriverName?: string;
      trailerDriverName?: string;
      truckNumber?: string;
      trailerNumber?: string;
    } = {};
    let hasConflict = false;
    const { truckId: origTruckId, trailerId: origTrailerId } = originalAssignmentRef.current;

    // Check if the selected truck is assigned to another driver
    if (formData.truck_id && formData.truck_id !== origTruckId) {
      const selectedTruck = allTrucks?.find(t => t.id === formData.truck_id);
      if (selectedTruck?.driver1_id && selectedTruck.driver1_id !== editingDriver?.id) {
        // Get driver name
        const { data: driverData } = await supabase
          .from("drivers")
          .select("name")
          .eq("id", selectedTruck.driver1_id)
          .single();
        if (driverData) {
          result.truckDriverName = driverData.name || "Unknown Driver";
          result.truckNumber = selectedTruck.truck_number;
          hasConflict = true;
        }
      }
    }

    // Check if the selected trailer is assigned to another truck (with a different driver)
    if (formData.trailer_id && formData.trailer_id !== origTrailerId) {
      const { data: trucksWithTrailer } = await supabase
        .from("trucks")
        .select("id, truck_number, driver1_id, trailer_id")
        .eq("trailer_id", formData.trailer_id)
        .neq("id", formData.truck_id || "")
        .limit(1);

      if (trucksWithTrailer && trucksWithTrailer.length > 0) {
        const truckWithTrailer = trucksWithTrailer[0];
        if (truckWithTrailer.driver1_id && truckWithTrailer.driver1_id !== editingDriver?.id) {
          const { data: driverData } = await supabase
            .from("drivers")
            .select("name")
            .eq("id", truckWithTrailer.driver1_id)
            .single();
          if (driverData) {
            // Get trailer number
            const { data: trailerData } = await supabase
              .from("trailers")
              .select("trailer_number")
              .eq("id", formData.trailer_id)
              .single();
            result.trailerDriverName = driverData.name || "Unknown Driver";
            result.trailerNumber = trailerData?.trailer_number || "Unknown";
            hasConflict = true;
          }
        }
      }
    }

    return hasConflict ? result : null;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // First check for already assigned equipment
    const alreadyAssigned = await checkAlreadyAssigned();
    if (alreadyAssigned) {
      setAlreadyAssignedInfo(alreadyAssigned);
      setShowAlreadyAssignedWarning(true);
      return;
    }
    
    proceedWithSubmit();
  };

  const proceedWithSubmit = () => {
    const reasonNeeded = checkAssignmentChangeNeedsReason();
    if (reasonNeeded) {
      setPendingReasonType(reasonNeeded);
      setShowReasonDialog(true);
    } else {
      // No reason needed, proceed directly
      handleEditDriverWithReason(null);
    }
  };

  const handleAlreadyAssignedConfirm = () => {
    setShowAlreadyAssignedWarning(false);
    setAlreadyAssignedInfo(null);
    proceedWithSubmit();
  };

  const handleAlreadyAssignedCancel = () => {
    setShowAlreadyAssignedWarning(false);
    setAlreadyAssignedInfo(null);
  };

  const handleReasonConfirm = (reason: string) => {
    setShowReasonDialog(false);
    handleEditDriverWithReason(reason);
  };

  const handleReasonCancel = () => {
    setShowReasonDialog(false);
  };

  const handleEditDriverWithReason = async (reason: string | null) => {
    if (!editingDriver) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("drivers")
        .update({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          name: `${formData.first_name.trim()} ${formData.last_name.trim()}`.trim(),
          phone: formData.phone || null,
          email: formData.email || null,
          company_id: formData.company_id || null,
          emergency_contact_name: formData.emergency_contact_name || null,
          emergency_contact_relation: formData.emergency_contact_relation || null,
          emergency_contact_phone: formData.emergency_contact_phone || null,
          dispatcher_id: formData.dispatcher_id || null,
          home_address: formData.home_address || null,
          home_city: formData.home_city || null,
          home_state: formData.home_state || null,
          home_latitude: formData.home_latitude ? parseFloat(formData.home_latitude) : null,
          home_longitude: formData.home_longitude ? parseFloat(formData.home_longitude) : null,
          cdl_number: formData.cdl_number || null,
          cdl_expiration_date: formData.cdl_expiration_date || null,
          medical_card_expiration_date: formData.medical_card_expiration_date || null,
          random_drug_test_date: formData.random_drug_test_date || null,
          hire_date: formData.hire_date || null,
          termination_date: formData.termination_date || null,
          mvr_date: formData.mvr_date || null,
          clearing_house: formData.clearing_house || null,
          license_number: formData.cdl_number || null,
          company_name: formData.company_name || null,
          company_address: formData.company_address || null,
          mc_number: formData.mc_number || null,
          weekly_payment: formData.weekly_payment ? parseInt(formData.weekly_payment) : null,
          weeks_count: formData.weeks_count ? parseInt(formData.weeks_count) : null,
          agreement_start_date: formData.agreement_start_date || null,
          is_company_driver: formData.is_company_driver || false,
          is_recovery: formData.is_recovery || false,
          do_not_touch_hos: formData.do_not_touch_hos || false,
          cents_per_mile: formData.is_company_driver && formData.cents_per_mile ? parseInt(formData.cents_per_mile) : null,
          note: formData.note || null,
        })
        .eq("id", editingDriver.id);

      if (error) throw error;

      if (canViewSensitiveData) {
        const { error: piiError } = await supabase.from("driver_sensitive_pii").upsert(
          {
            driver_id: editingDriver.id,
            ssn: formData.ssn || null,
            fein: formData.fein || null,
            fuel_card_number: formData.fuel_card_number || null,
            personal_id: formData.personal_id || null,
          },
          { onConflict: "driver_id" }
        );
        if (piiError) throw piiError;
      }

      // Handle truck assignment
      const { data: currentTrucks } = await supabase
        .from("trucks")
        .select("id")
        .or(`driver1_id.eq.${editingDriver.id},driver2_id.eq.${editingDriver.id}`)
        .limit(1)
        .single();

      const existingTruckId = currentTrucks?.id;
      const { truckId: origTruckId, trailerId: origTrailerId } = originalAssignmentRef.current;

      // Track if assignment changed for history logging
      const truckChanged = (formData.truck_id || null) !== origTruckId;
      const trailerChanged = (formData.trailer_id || null) !== origTrailerId;

      if (formData.truck_id) {
        if (formData.trailer_id) {
          await supabase
            .from("trucks")
            .update({ trailer_id: null })
            .eq("trailer_id", formData.trailer_id)
            .neq("id", formData.truck_id);
        }

        // Update truck with driver and inherit driver's company
        const { error: truckError } = await supabase
          .from("trucks")
          .update({
            driver1_id: editingDriver.id,
            trailer_id: formData.trailer_id || null,
            company_id: formData.company_id || null,
          })
          .eq("id", formData.truck_id);
        if (truckError) throw truckError;

        await supabase
          .from("trucks")
          .update({ driver1_id: null })
          .eq("driver1_id", editingDriver.id)
          .neq("id", formData.truck_id);

        await supabase
          .from("trucks")
          .update({ driver2_id: null })
          .eq("driver2_id", editingDriver.id)
          .neq("id", formData.truck_id);
      } else if (formData.trailer_id && existingTruckId) {
        await supabase
          .from("trucks")
          .update({ trailer_id: null })
          .eq("trailer_id", formData.trailer_id)
          .neq("id", existingTruckId);

        const { error: trailerError } = await supabase
          .from("trucks")
          .update({
            driver1_id: editingDriver.id,
            trailer_id: formData.trailer_id,
          })
          .eq("id", existingTruckId);
        if (trailerError) throw trailerError;
      } else if (!formData.truck_id && !formData.trailer_id) {
        await supabase.from("trucks").update({ driver1_id: null }).eq("driver1_id", editingDriver.id);
        await supabase.from("trucks").update({ driver2_id: null }).eq("driver2_id", editingDriver.id);
      }

      // Insert assignment history for any assignment change
      // HARDENED: Include old_ values for accurate "from → to" display
      const { data: userData } = await supabase.auth.getUser();
      
      // Log truck change separately if truck changed
      if (truckChanged) {
        await supabase.from("assignment_history").insert({
          truck_id: formData.truck_id || null,
          trailer_id: formData.trailer_id || origTrailerId || null,
          driver1_id: editingDriver.id,
          driver2_id: null,
          // HARDENED: Include old values
          old_truck_id: origTruckId || null,
          old_trailer_id: origTrailerId || null,
          old_driver1_id: editingDriver.id,
          old_driver2_id: null,
          change_type: "truck_assignment",
          changed_by: userData?.user?.id || null,
          reason: reason,
        });
      }
      
      // Log trailer change separately if trailer changed
      if (trailerChanged) {
        await supabase.from("assignment_history").insert({
          truck_id: formData.truck_id || origTruckId || null,
          trailer_id: formData.trailer_id || null,
          driver1_id: editingDriver.id,
          driver2_id: null,
          // HARDENED: Include old values
          old_truck_id: origTruckId || null,
          old_trailer_id: origTrailerId || null,
          old_driver1_id: editingDriver.id,
          old_driver2_id: null,
          change_type: "trailer_assignment",
          changed_by: userData?.user?.id || null,
          reason: reason,
        });
      }

      toast({ title: "Success", description: "Driver updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
      queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-history"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      let errorMessage = error.message || "Failed to update driver";
      if (error.message?.includes("duplicate key value") && error.message?.includes("drivers_email_key")) {
        errorMessage = "A driver with this email already exists.";
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDoneClick = () => setShowDoneConfirmation(true);

  const handleConfirmDone = () => {
    setShowDoneConfirmation(false);
    setShowNoteDialog(true);
  };

  const handleSaveTerminationNote = async () => {
    if (!editingDriver || !terminationNote.trim()) {
      toast({ title: "Error", description: "Please enter a note", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error: noteError } = await supabase.from("driver_termination_notes").insert({
        driver_id: editingDriver.id,
        note: terminationNote.trim(),
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (noteError) throw noteError;

      const { error: driverError } = await supabase
        .from("drivers")
        .update({
          is_active: false,
          termination_date: new Date().toISOString().split("T")[0],
          dispatcher_id: null,
        })
        .eq("id", editingDriver.id);
      if (driverError) throw driverError;

      const { data: truck } = await supabase
        .from("trucks")
        .select("id, driver1_id, driver2_id")
        .or(`driver1_id.eq.${editingDriver.id},driver2_id.eq.${editingDriver.id}`)
        .maybeSingle();

      if (truck) {
        const updateData: any = { trailer_id: null };
        if (truck.driver1_id === editingDriver.id) updateData.driver1_id = null;
        if (truck.driver2_id === editingDriver.id) updateData.driver2_id = null;
        await supabase.from("trucks").update(updateData).eq("id", truck.id);
      }

      toast({ title: "Success", description: `${formData.first_name} ${formData.last_name} has been marked as done` });
      setTerminationNote("");
      setShowNoteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to mark driver as done", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartDriver = async () => {
    if (!editingDriver) return;
    setIsSubmitting(true);
    try {
      await supabase.from("driver_termination_notes").delete().eq("driver_id", editingDriver.id);
      const { error } = await supabase
        .from("drivers")
        .update({ is_active: true, termination_date: null })
        .eq("id", editingDriver.id);
      if (error) throw error;

      toast({ title: "Success", description: `${formData.first_name} ${formData.last_name} has been reactivated` });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reactivate driver", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTwoWeekBlock = async () => {
    if (!editingDriver) return;

    if (editingDriver.two_week_block_date) {
      if (!confirm("Do you want to cancel the 2-week block?")) return;
      setIsSubmitting(true);
      try {
        await supabase.from("drivers").update({ two_week_block_date: null }).eq("id", editingDriver.id);
        await supabase.from("orders").delete().eq("driver1_id", editingDriver.id).eq("load_number", "GAME-OVER");
        toast({ title: "Success", description: "2-week block cancelled" });
        queryClient.invalidateQueries({ queryKey: ["drivers"] });
        queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });
        onOpenChange(false);
        onSuccess?.();
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to cancel 2-week block", variant: "destructive" });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setTwoWeekNoticeDialog(true);
  };

  const handleSetTwoWeekNotice = async () => {
    if (!editingDriver || !twoWeekNoticeDate) return;

    setIsSubmitting(true);
    try {
      const blockDate = format(twoWeekNoticeDate, "yyyy-MM-dd");
      await supabase.from("drivers").update({ two_week_block_date: blockDate }).eq("id", editingDriver.id);
      toast({ title: "Success", description: "2-week notice set successfully" });
      setTwoWeekNoticeDialog(false);
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to set 2-week notice", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Driver</DialogTitle>
            <DialogDescription className="sr-only">Edit driver information and details</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Driver Info</TabsTrigger>
              <TabsTrigger value="files">Driver Files</TabsTrigger>
            </TabsList>

            <TabsContent value="info">
              <form id="edit-driver-form" onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-12 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="edit_first_name">First Name*</Label>
                    <Input
                      id="edit_first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="edit_last_name">Last Name*</Label>
                    <Input
                      id="edit_last_name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      placeholder="Smith"
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-3">
                    <Label htmlFor="edit_phone">Phone</Label>
                    <Input
                      id="edit_phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="space-y-2 col-span-4">
                    <Label htmlFor="edit_email">Email</Label>
                    <Input
                      id="edit_email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john.smith@company.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_company">Company*</Label>
                  <Combobox
                    options={(companies || []).map((c) => ({ value: c.id, label: c.name }))}
                    value={formData.company_id}
                    onValueChange={(v) => setFormData({ ...formData, company_id: v })}
                    placeholder="Select company..."
                    emptyText="No companies found"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Emergency Contact Name</Label>
                    <Input
                      value={formData.emergency_contact_name}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Relation</Label>
                    <Input
                      value={formData.emergency_contact_relation}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_relation: e.target.value })}
                      placeholder="Spouse"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Emergency Contact Phone</Label>
                    <Input
                      value={formData.emergency_contact_phone}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_phone: formatPhoneNumber(e.target.value) })}
                      placeholder="(555) 987-6543"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-4 items-end">
                  <div className="space-y-2 col-span-5">
                    <Label>Truck Number</Label>
                    <Combobox
                      options={(availableTrucks || []).map((t) => ({ value: t.id, label: t.truck_number }))}
                      value={formData.truck_id}
                      onValueChange={(v) => {
                        const selectedTruck = availableTrucks?.find((t) => t.id === v);
                        setFormData({ ...formData, truck_id: v, trailer_id: selectedTruck?.trailer_id || "" });
                        setSelectedTruckId(v);
                      }}
                      placeholder="Select truck..."
                      emptyText="No available trucks"
                    />
                  </div>
                  <div className="space-y-2 col-span-5">
                    <Label>Trailer Number</Label>
                    <Combobox
                      options={(availableTrailers || []).map((t) => ({ value: t.id, label: t.trailer_number }))}
                      value={formData.trailer_id}
                      onValueChange={(v) => setFormData({ ...formData, trailer_id: v })}
                      placeholder={formData.truck_id ? "Select trailer..." : "Select truck first"}
                      emptyText="No available trailers"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormData({ ...formData, truck_id: "", trailer_id: "" })}
                      className="w-full"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label>Weekly Payment</Label>
                    <Input
                      type="number"
                      value={formData.weekly_payment}
                      onChange={(e) => setFormData({ ...formData, weekly_payment: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Weeks</Label>
                    <Input
                      type="number"
                      value={formData.weeks_count}
                      onChange={(e) => setFormData({ ...formData, weeks_count: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Agreement Start Date</Label>
                    <Input
                      type="date"
                      value={formData.agreement_start_date}
                      onChange={(e) => setFormData({ ...formData, agreement_start_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Dispatcher</Label>
                  <Combobox
                    options={allDispatchers.map((d) => ({ value: d.id, label: d.full_name || d.email }))}
                    value={formData.dispatcher_id}
                    onValueChange={(v) => setFormData({ ...formData, dispatcher_id: v })}
                    placeholder="Select dispatcher..."
                    emptyText="No dispatchers found"
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="space-y-2 col-span-7">
                      <Label>Home Address</Label>
                      <Input
                        value={formData.home_address}
                        onChange={(e) => setFormData({ ...formData, home_address: e.target.value })}
                        placeholder="1234 Oak Street"
                      />
                    </div>
                    <div className="space-y-2 col-span-3">
                      <Label>Home City</Label>
                      <Input
                        value={formData.home_city}
                        onChange={(e) => setFormData({ ...formData, home_city: e.target.value })}
                        placeholder="Chicago"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Home State</Label>
                      <Input
                        value={formData.home_state}
                        onChange={(e) => setFormData({ ...formData, home_state: e.target.value })}
                        placeholder="IL"
                      />
                    </div>
                  </div>
                </div>

                {canViewSensitiveData && (
                  <>
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-4">
                        🔒 Sensitive Information (Managers/Admins Only)
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Personal ID</Label>
                          <Input
                            value={formData.personal_id}
                            onChange={(e) => setFormData({ ...formData, personal_id: e.target.value })}
                            placeholder="Personal ID"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Fuel Card #</Label>
                          <Input
                            value={formData.fuel_card_number}
                            onChange={(e) => setFormData({ ...formData, fuel_card_number: e.target.value })}
                            placeholder="Fuel Card Number"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Company Name</Label>
                          <Input
                            value={formData.company_name}
                            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                            placeholder="Company Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Company Address</Label>
                          <Input
                            value={formData.company_address}
                            onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
                            placeholder="Company Address"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>MC Number</Label>
                          <Input
                            value={formData.mc_number}
                            onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })}
                            placeholder="MC Number"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="space-y-2">
                          <Label>SSN #</Label>
                          <Input
                            value={formData.ssn}
                            onChange={(e) => setFormData({ ...formData, ssn: e.target.value })}
                            placeholder="SSN"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>FEIN #</Label>
                          <Input
                            value={formData.fein}
                            onChange={(e) => setFormData({ ...formData, fein: e.target.value })}
                            placeholder="FEIN"
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Note</Label>
                          <Textarea
                            value={formData.note}
                            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                            placeholder="Driver note..."
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CDL Number</Label>
                    <Input
                      value={formData.cdl_number}
                      onChange={(e) => setFormData({ ...formData, cdl_number: e.target.value })}
                      placeholder="CDL Number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CDL Expiration Date</Label>
                    <Input
                      type="date"
                      value={formData.cdl_expiration_date}
                      onChange={(e) => setFormData({ ...formData, cdl_expiration_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Hire Date</Label>
                    <Input
                      type="date"
                      value={formData.hire_date}
                      onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Termination Date</Label>
                    <Input
                      type="date"
                      value={formData.termination_date}
                      onChange={(e) => setFormData({ ...formData, termination_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>MVR Date</Label>
                    <Input
                      type="date"
                      value={formData.mvr_date}
                      onChange={(e) => setFormData({ ...formData, mvr_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Clearing House</Label>
                    <Input
                      type="date"
                      value={formData.clearing_house}
                      onChange={(e) => setFormData({ ...formData, clearing_house: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Medical Card Exp</Label>
                    <Input
                      type="date"
                      value={formData.medical_card_expiration_date}
                      onChange={(e) => setFormData({ ...formData, medical_card_expiration_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Random Drug Test</Label>
                    <Input
                      type="date"
                      value={formData.random_drug_test_date}
                      onChange={(e) => setFormData({ ...formData, random_drug_test_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit_is_company_driver"
                      checked={formData.is_company_driver}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          is_company_driver: checked === true,
                          cents_per_mile: checked ? formData.cents_per_mile : "",
                        })
                      }
                    />
                    <Label htmlFor="edit_is_company_driver" className="cursor-pointer">
                      Company Driver
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit_is_recovery"
                      checked={formData.is_recovery}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          is_recovery: checked === true,
                        })
                      }
                    />
                    <Label htmlFor="edit_is_recovery" className="cursor-pointer">
                      Recovery Driver
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit_do_not_touch_hos"
                      checked={formData.do_not_touch_hos}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          do_not_touch_hos: checked === true,
                        })
                      }
                    />
                    <Label htmlFor="edit_do_not_touch_hos" className="cursor-pointer">
                      Drives Legally
                    </Label>
                  </div>
                  {formData.is_company_driver && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={formData.cents_per_mile}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "" || parseInt(value) > 0) {
                            setFormData({ ...formData, cents_per_mile: value });
                          }
                        }}
                        placeholder="60"
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">cents/mile</span>
                    </div>
                  )}
                </div>
              </form>
            </TabsContent>

            <TabsContent value="files">
              {editingDriver && <DriverFilesManager driverId={editingDriver.id} driverName={editingDriver.name} />}
            </TabsContent>
          </Tabs>

          <div className="flex justify-between gap-3 mt-6">
            <div className="flex gap-3">
              {!editingDriver?.is_active ? (
                <Button type="button" variant="default" onClick={handleStartDriver} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Play className="mr-2 h-4 w-4" />
                  Start
                </Button>
              ) : (
                <>
                  <Button type="button" variant="destructive" onClick={handleDoneClick} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Done
                  </Button>
                  <Button
                    type="button"
                    variant={editingDriver?.two_week_block_date ? "outline" : "secondary"}
                    onClick={handleTwoWeekBlock}
                    disabled={isSubmitting}
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingDriver?.two_week_block_date ? "Cancel 2 Week" : "2 Week"}
                  </Button>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                onClick={(e) => {
                  e.preventDefault();
                  const form = document.getElementById("edit-driver-form") as HTMLFormElement;
                  if (form) form.requestSubmit();
                }}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Driver
              </Button>
            </div>
          </div>

          {!editingDriver?.is_active && terminationNotes.length > 0 && (
            <div className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold">Termination Notes</h3>
              {isLoadingNotes ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {terminationNotes.map((note) => (
                    <Card key={note.id}>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.note}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(note.created_at).toLocaleString()}
                        </p>
                        {note.creator_name && (
                          <p className="text-xs text-muted-foreground">
                            By: {note.creator_name}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Done Confirmation Dialog */}
      <AlertDialog open={showDoneConfirmation} onOpenChange={setShowDoneConfirmation}>
        <AlertDialogContent>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Termination Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="termination_note">Note</Label>
              <Textarea
                id="termination_note"
                value={terminationNote}
                onChange={(e) => setTerminationNote(e.target.value)}
                placeholder="Enter termination note..."
                className="min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowNoteDialog(false);
                  setTerminationNote("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveTerminationNote} disabled={isSubmitting || !terminationNote.trim()}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Two Week Notice Dialog */}
      <Dialog open={twoWeekNoticeDialog} onOpenChange={setTwoWeekNoticeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set 2 Week Notice - {editingDriver?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Last Date of 2 Week Notice</Label>
              <DatePicker date={twoWeekNoticeDate} onDateChange={setTwoWeekNoticeDate} placeholder="Select last date" />
              {twoWeekNoticeDate && (
                <p className="text-xs text-muted-foreground">
                  Start date was: {format(new Date(twoWeekNoticeDate.getTime() - 14 * 24 * 60 * 60 * 1000), "MMMM d, yyyy")}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setTwoWeekNoticeDialog(false);
                  setTwoWeekNoticeDate(new Date());
                }}
              >
                Cancel
              </Button>
              <Button disabled={!twoWeekNoticeDate || isSubmitting} onClick={handleSetTwoWeekNotice}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Already Assigned Warning Dialog */}
      <AlertDialog open={showAlreadyAssignedWarning} onOpenChange={setShowAlreadyAssignedWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Equipment Already Assigned</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {alreadyAssignedInfo?.truckDriverName && (
                  <p>
                    Truck <span className="font-semibold">{alreadyAssignedInfo.truckNumber}</span> is currently assigned to{" "}
                    <span className="font-semibold">{alreadyAssignedInfo.truckDriverName}</span>.
                  </p>
                )}
                {alreadyAssignedInfo?.trailerDriverName && (
                  <p>
                    Trailer <span className="font-semibold">{alreadyAssignedInfo.trailerNumber}</span> is currently assigned to{" "}
                    <span className="font-semibold">{alreadyAssignedInfo.trailerDriverName}</span>.
                  </p>
                )}
                <p className="mt-2">Are you sure you want to proceed with this assignment?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleAlreadyAssignedCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAlreadyAssignedConfirm}>Yes, Proceed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assignment Reason Dialog */}
      <AssignmentReasonDialog
        open={showReasonDialog}
        onOpenChange={setShowReasonDialog}
        changeType={pendingReasonType}
        onConfirm={handleReasonConfirm}
        onCancel={handleReasonCancel}
      />
    </>
  );
}
