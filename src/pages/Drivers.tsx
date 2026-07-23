import { useState, useEffect, useRef } from "react";
import { isValidUUID } from "@/utils/validation";
import { formatPhoneNumber } from "@/lib/utils";
import { geocodeDriverHome } from "@/utils/geocodeDriverHome";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TranslateNoteButton } from "@/components/TranslateNoteButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  Edit,
  Phone,
  Mail,
  Trash2,
  Loader2,
  CheckCircle2,
  Play,
  RefreshCw,
  History,
  CalendarIcon,
  Download,
} from "lucide-react";
import { US_STATES } from "@/lib/constants";
import * as XLSX from "xlsx";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { useDrivers } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { useTrucks } from "@/hooks/useTrucks";
import { useTrailers } from "@/hooks/useTrailers";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriverFilesManager } from "@/components/DriverFilesManager";
import { DriverFilesManagerPending } from "@/components/DriverFilesManagerPending";
import { useDriverSensitivePII } from "@/hooks/useDriverSensitivePII";
import { useAuthContext } from "@/contexts/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDriverDrugTests } from "@/hooks/useDriverDrugTests";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AssignmentHistoryDialog } from "@/components/AssignmentHistoryDialog";
import { AssignmentReasonDialog, AssignmentConflict } from "@/components/AssignmentReasonDialog";
import { useCompanies } from "@/hooks/useCompanies";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
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
  drugTestResult: "positive" | "negative" | "pending" | null;
  is_company_driver: boolean;
  is_recovery: boolean;
  do_not_touch_hos: boolean;
  hazmat: boolean;
  tanker: boolean;
  twic: boolean;
  citizen: boolean;
  criminal: boolean;
  straps: number;
  load_bars: number;
  cents_per_mile: string;
  note: string;
}
const Drivers = () => {
  const location = useLocation();
  const { hasRole, profile } = useAuthContext();
  const canViewSensitiveData = hasRole("manager") || hasRole("admin") || hasRole("accounting");
  const canDelete = hasRole("admin") || hasRole("manager") || hasRole("safety") || hasRole("maintenance");
  const { upsertDrugTest } = useDriverDrugTests();
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [truckFilter, setTruckFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [recoveryFilter, setRecoveryFilter] = useState<"all" | "recovery" | "regular">("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [homeStateFilter, setHomeStateFilter] = useState<string>("all");
  const [inactiveSortField, setInactiveSortField] = useState<"hire_date" | "termination_date" | null>(null);
  const [inactiveSortDir, setInactiveSortDir] = useState<"asc" | "desc">("desc");
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyDriverId, setHistoryDriverId] = useState<string | null>(null);
  const [historyDriverName, setHistoryDriverName] = useState<string>("");
  const [newlyCreatedDriverId, setNewlyCreatedDriverId] = useState<string | null>(null);
  const [addDialogTab, setAddDialogTab] = useState<string>("info");
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; id: string }>>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [twoWeekNoticeDialog, setTwoWeekNoticeDialog] = useState(false);
  const [twoWeekNoticeDate, setTwoWeekNoticeDate] = useState<Date | undefined>(new Date());

  // Assignment reason dialog state
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [pendingReasonType, setPendingReasonType] = useState<"truck" | "trailer" | "both" | null>(null);
  const [assignmentConflicts, setAssignmentConflicts] = useState<AssignmentConflict[]>([]);
  const originalAssignmentRef = useRef<{ truckId: string | null; trailerId: string | null }>({
    truckId: null,
    trailerId: null,
  });
  const isDriver2Ref = useRef(false);

  const itemsPerPage = 100;
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
    hire_date: new Date().toISOString().split("T")[0],
    termination_date: "",
    mvr_date: "",
    clearing_house: "",
    ssn: "",
    fein: "",
    drugTestResult: null,
    is_company_driver: false,
    is_recovery: false,
    do_not_touch_hos: false,
    hazmat: false,
    tanker: false,
    twic: false,
    citizen: true,
    criminal: false,
    straps: 2,
    load_bars: 0,
    cents_per_mile: "",
    note: "",
  });
  const { toast } = useToast();
  const { data: drivers, isLoading, refetch } = useDrivers();

  // Force immediate refetch on mount to clear any stale cache
  useEffect(() => {
    // Clear old query cache if it exists
    queryClient.removeQueries({ queryKey: ["drivers"] });
    // Trigger a fresh fetch
    refetch();
  }, []); // Only on mount

  // Handle incoming navigation state to open edit dialog
  useEffect(() => {
    const state = location.state as { editDriverId?: string } | null;
    if (state?.editDriverId && drivers && !isLoading) {
      const driver = drivers.find((d: any) => d.id === state.editDriverId);
      if (driver) {
        // Use setTimeout to ensure the component is fully mounted
        setTimeout(() => {
          openEditDialog(driver);
        }, 100);
        // Clear the state to prevent re-opening on subsequent renders
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, drivers, isLoading]);

  const { data: allTrucks } = useAvailableTrucks();
  const { data: trucks } = useTrucks();
  const { data: trailers } = useTrailers();
  const { data: availableTrailers } = useAvailableTrailers(selectedTruckId || formData.truck_id);
  const { data: sensitivePII, refetch: refetchSensitivePII } = useDriverSensitivePII(editingDriver?.id);
  const { allDispatchers } = useFleetManagement();
  const { data: companies } = useCompanies();

  // Fetch termination notes for the editing driver
  const [terminationNotes, setTerminationNotes] = useState<any[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  // Fetch termination notes when dialog opens
  const fetchTerminationNotes = async (driverId: string) => {
    setIsLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from("driver_termination_notes")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", {
          ascending: false,
        });
      if (error) throw error;

      // Fetch creator names for notes with created_by
      const allCreatorIds = [...new Set((data || []).map((n) => n.created_by).filter(Boolean))] as string[];
      const creatorIds = allCreatorIds.filter(isValidUUID);
      if (creatorIds.length < allCreatorIds.length) {
        console.warn(`[Drivers] Filtered ${allCreatorIds.length - creatorIds.length} invalid UUIDs from created_by`);
      }
      let creatorsMap: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", creatorIds);
        creatorsMap = (profiles || []).reduce(
          (acc, p) => {
            if (p.user_id && p.full_name) acc[p.user_id] = p.full_name;
            return acc;
          },
          {} as Record<string, string>,
        );
      }

      const notesWithCreators = (data || []).map((note) => ({
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

  // Filter drivers based on search term, status, and truck assignment
  const filteredDrivers =
    drivers?.filter((driver: any) => {
      // Normalize phone search by stripping all non-digit characters
      const normalizedSearchDigits = searchTerm.replace(/\D/g, "");
      const normalizedPhone = (driver.phone || "").replace(/\D/g, "");

      // Search filter
      const matchesSearch =
        driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.home_city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.home_state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.truck_info?.truck_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.truck_info?.trailer_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.dispatcher_info?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (normalizedSearchDigits.length > 0 && normalizedPhone.includes(normalizedSearchDigits));

      // Status filter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && driver.is_active) ||
        (statusFilter === "inactive" && !driver.is_active);

      // Truck filter
      const hasTruck = !!driver.truck_info?.truck_number;
      const matchesTruck =
        truckFilter === "all" ||
        (truckFilter === "assigned" && hasTruck) ||
        (truckFilter === "unassigned" && !hasTruck);

      // Recovery filter
      const matchesRecovery =
        recoveryFilter === "all" ||
        (recoveryFilter === "recovery" && driver.is_recovery) ||
        (recoveryFilter === "regular" && !driver.is_recovery);

      // Company filter
      const matchesCompany = companyFilter === "all" || driver.company_id === companyFilter;

      // Home state filter
      const matchesHomeState = homeStateFilter === "all" || driver.home_state === homeStateFilter;

      return matchesSearch && matchesStatus && matchesTruck && matchesRecovery && matchesCompany && matchesHomeState;
    }) || [];

  // Sort inactive drivers by date if sort is active
  const sortedFilteredDrivers = (() => {
    const result = [...filteredDrivers];
    if (statusFilter === "inactive" && inactiveSortField) {
      result.sort((a, b) => {
        const aVal = a[inactiveSortField] || "";
        const bVal = b[inactiveSortField] || "";
        if (aVal === bVal) return 0;
        if (!aVal) return 1;
        if (!bVal) return -1;
        return inactiveSortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }
    return result;
  })();

  // Pagination
  const totalPages = Math.ceil(sortedFilteredDrivers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDrivers = sortedFilteredDrivers.slice(startIndex, endIndex);

  const handleInactiveSort = (field: "hire_date" | "termination_date") => {
    if (inactiveSortField === field) {
      setInactiveSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setInactiveSortField(field);
      setInactiveSortDir("desc");
    }
  };

  // Reset to first page when search term changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };
  const resetForm = () => {
    setFormData({
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
      hire_date: new Date().toISOString().split("T")[0],
      termination_date: "",
      mvr_date: "",
      clearing_house: "",
      ssn: "",
      fein: "",
      drugTestResult: null,
      is_company_driver: false,
      is_recovery: false,
      do_not_touch_hos: false,
      hazmat: false,
      tanker: false,
      twic: false,
      citizen: true,
      criminal: false,
      straps: 2,
      load_bars: 0,
      cents_per_mile: "",
      note: "",
    });
    setSelectedTruckId("");
    setNewlyCreatedDriverId(null);
    setAddDialogTab("info");
    setPendingFiles([]);
    isDriver2Ref.current = false;
  };
  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast({
        title: "Error",
        description: "First name and last name are required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.phone.trim()) {
      toast({
        title: "Error",
        description: "Phone is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email.trim()) {
      toast({
        title: "Error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.company_id) {
      toast({
        title: "Error",
        description: "Company is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.home_city.trim()) {
      toast({
        title: "Error",
        description: "Home city is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.home_state.trim()) {
      toast({
        title: "Error",
        description: "Home state is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Auto-geocode home if user didn't manually type lat/lng
      let homeLat: number | null = formData.home_latitude ? parseFloat(formData.home_latitude) : null;
      let homeLng: number | null = formData.home_longitude ? parseFloat(formData.home_longitude) : null;
      if ((homeLat === null || homeLng === null) && formData.home_city.trim() && formData.home_state.trim()) {
        const geo = await geocodeDriverHome({
          home_address: formData.home_address,
          home_city: formData.home_city,
          home_state: formData.home_state,
        });
        if (geo) {
          homeLat = geo.lat;
          homeLng = geo.lng;
        }
      }

      // Create driver record including home address
      const { data: driverData, error } = await supabase
        .from("drivers")
        .insert({
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
          home_latitude: homeLat,
          home_longitude: homeLng,
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
          hazmat: formData.hazmat,
          tanker: formData.tanker,
          twic: formData.twic,
          citizen: formData.citizen,
          criminal: formData.criminal,
          straps: formData.straps,
          load_bars: formData.load_bars,
          cents_per_mile:
            formData.is_company_driver && formData.cents_per_mile ? parseInt(formData.cents_per_mile) : null,
          note: formData.note || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Insert sensitive PII if user has permission (managers/admins only)
      if (canViewSensitiveData && driverData) {
        const { error: piiError } = await supabase.from("driver_sensitive_pii").insert({
          driver_id: driverData.id,
          ssn: formData.ssn || null,
          fein: formData.fein || null,
          fuel_card_number: formData.fuel_card_number || null,
          personal_id: formData.personal_id || null,
        });
        if (piiError) throw piiError;
      }

      // Update truck if selected - ATOMIC OPERATION
      if (formData.truck_id && driverData) {
        // Remove trailer from any other truck if selected
        if (formData.trailer_id) {
          await supabase
            .from("trucks")
            .update({ trailer_id: null })
            .eq("trailer_id", formData.trailer_id)
            .neq("id", formData.truck_id);
        }

        // Single atomic update: assign driver and trailer to target truck
        // AND set truck's company to match driver's company
        const { error: truckError } = await supabase
          .from("trucks")
          .update({
            driver1_id: driverData.id,
            trailer_id: formData.trailer_id || null,
            company_id: formData.company_id || null,
          })
          .eq("id", formData.truck_id);
        if (truckError) throw truckError;

        // Now safely clear driver from other trucks (excluding the one we just assigned)
        await supabase
          .from("trucks")
          .update({ driver1_id: null })
          .eq("driver1_id", driverData.id)
          .neq("id", formData.truck_id);
        await supabase
          .from("trucks")
          .update({ driver2_id: null })
          .eq("driver2_id", driverData.id)
          .neq("id", formData.truck_id);
      }

      // Add drug test result if provided
      if (formData.drugTestResult && driverData) {
        await upsertDrugTest.mutateAsync({
          driverId: driverData.id,
          result: formData.drugTestResult,
          truckId: formData.truck_id,
        });
      }

      // Set the newly created driver ID
      setNewlyCreatedDriverId(driverData.id);

      // Upload pending files if any
      if (pendingFiles.length > 0) {
        setIsUploadingFiles(true);
        try {
          const uploadPromises = pendingFiles.map(async (pendingFile) => {
            const fileExt = pendingFile.file.name.split(".").pop();
            const fileName = `${driverData.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
              .from("driver-files")
              .upload(fileName, pendingFile.file);

            if (uploadError) throw uploadError;

            const { error: dbError } = await supabase.from("driver_files").insert({
              driver_id: driverData.id,
              file_name: pendingFile.file.name,
              file_path: fileName,
              file_size: pendingFile.file.size,
              content_type: pendingFile.file.type,
              uploaded_by: profile?.email || "unknown",
            });

            if (dbError) throw dbError;
          });

          await Promise.all(uploadPromises);

          toast({
            title: "Success",
            description: `Driver added and ${pendingFiles.length} file(s) uploaded successfully`,
          });

          setPendingFiles([]);
        } catch (error) {
          console.error("Error uploading files:", error);
          toast({
            title: "Partial Success",
            description: "Driver added but some files failed to upload",
            variant: "destructive",
          });
        } finally {
          setIsUploadingFiles(false);
        }
      } else {
        toast({
          title: "Success",
          description: "Driver added successfully",
        });
      }

      // Switch to files tab
      setAddDialogTab("files");

      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
    } catch (error: any) {
      let errorMessage = error.message || "Failed to add driver";

      // Check for duplicate email error
      if (error.message?.includes("duplicate key value") && error.message?.includes("drivers_email_key")) {
        errorMessage =
          "A driver with this email already exists. Please use a different email or update the existing driver.";
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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

    if (truckChanged && hadTruck && trailerChanged && hadTrailer) {
      return "both";
    } else if (truckChanged && hadTruck) {
      return "truck";
    } else if (trailerChanged && hadTrailer) {
      return "trailer";
    }
    return null;
  };

  // Check if selected truck/trailer is already assigned to another driver/truck
  const checkAssignmentConflicts = (): AssignmentConflict[] => {
    if (!editingDriver) return [];
    const conflicts: AssignmentConflict[] = [];

    // Check truck conflict - if selected truck already has a different driver
    if (formData.truck_id) {
      const selectedTruck = trucks?.find((t) => t.id === formData.truck_id);
      // Skip conflict if this driver is driver2 on the same (unchanged) truck
      const isSameTruck = formData.truck_id === originalAssignmentRef.current.truckId;
      const skipConflict = isSameTruck && isDriver2Ref.current;
      if (!skipConflict && selectedTruck?.driver1_id && selectedTruck.driver1_id !== editingDriver.id) {
        const currentDriver = drivers?.find((d) => d.id === selectedTruck.driver1_id);
        conflicts.push({
          type: "driver",
          name: selectedTruck.truck_number,
          currentTruck: currentDriver?.name || "another driver",
        });
      }
    }

    // Check trailer conflict - if selected trailer is on another truck
    if (formData.trailer_id) {
      const conflictTruck = trucks?.find((t) => t.trailer_id === formData.trailer_id && t.id !== formData.truck_id);
      if (conflictTruck) {
        const trailer = trailers?.find((tr) => tr.id === formData.trailer_id);
        conflicts.push({
          type: "trailer",
          name: trailer?.trailer_number || "Unknown",
          currentTruck: conflictTruck.truck_number,
        });
      }
    }

    return conflicts;
  };

  const handleEditFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if reason is needed for assignment change
    const reasonNeeded = checkAssignmentChangeNeedsReason();
    const conflicts = checkAssignmentConflicts();

    if (reasonNeeded || conflicts.length > 0) {
      setPendingReasonType(reasonNeeded || "truck");
      setAssignmentConflicts(conflicts);
      setShowReasonDialog(true);
    } else {
      // No reason needed, proceed directly
      handleEditDriverWithReason(null);
    }
  };

  const handleEditDriverWithReason = async (reason: string | null) => {
    if (!editingDriver) return;
    setIsSubmitting(true);
    try {
      // Geocode only if home address fields changed AND user did not manually edit lat/lng
      const origAddress = editingDriver.home_address || "";
      const origCity = editingDriver.home_city || "";
      const origState = editingDriver.home_state || "";
      const origLat = editingDriver.home_latitude?.toString() || "";
      const origLng = editingDriver.home_longitude?.toString() || "";
      const homeFieldsChanged =
        formData.home_address !== origAddress || formData.home_city !== origCity || formData.home_state !== origState;
      const latLngManuallyEdited = formData.home_latitude !== origLat || formData.home_longitude !== origLng;

      let homeLat: number | null = formData.home_latitude ? parseFloat(formData.home_latitude) : null;
      let homeLng: number | null = formData.home_longitude ? parseFloat(formData.home_longitude) : null;
      const missingCoords = homeLat === null || homeLng === null;
      if (
        !latLngManuallyEdited &&
        (homeFieldsChanged || missingCoords) &&
        formData.home_city.trim() &&
        formData.home_state.trim()
      ) {
        const geo = await geocodeDriverHome({
          home_address: formData.home_address,
          home_city: formData.home_city,
          home_state: formData.home_state,
        });
        if (geo) {
          homeLat = geo.lat;
          homeLng = geo.lng;
        }
      }

      // Update driver record including home address
      const { error } = await supabase
        .from("drivers")
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          name: `${formData.first_name} ${formData.last_name}`.trim(),
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
          home_latitude: homeLat,
          home_longitude: homeLng,
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
          straps: formData.straps,
          load_bars: formData.load_bars,
          cents_per_mile:
            formData.is_company_driver && formData.cents_per_mile ? parseInt(formData.cents_per_mile) : null,
          note: formData.note || null,
        })
        .eq("id", editingDriver.id);
      if (error) throw error;

      // Update sensitive PII if user has permission (managers/admins only)
      if (canViewSensitiveData) {
        const { error: piiError } = await supabase.from("driver_sensitive_pii").upsert(
          {
            driver_id: editingDriver.id,
            ssn: formData.ssn || null,
            fein: formData.fein || null,
            fuel_card_number: formData.fuel_card_number || null,
            personal_id: formData.personal_id || null,
          },
          {
            onConflict: "driver_id",
          },
        );
        if (piiError) throw piiError;
      }

      // Handle truck assignment changes - ATOMIC OPERATION
      // First, find if driver is currently assigned to a truck
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

      // Handle truck/trailer assignment
      if (formData.truck_id) {
        // Truck is selected - assign both driver and trailer to it FIRST (atomic)
        if (formData.trailer_id) {
          await supabase
            .from("trucks")
            .update({ trailer_id: null })
            .eq("trailer_id", formData.trailer_id)
            .neq("id", formData.truck_id);
        }

        // Update truck with driver, trailer, and inherit driver's company
        // If driver is driver2 on the same truck, update driver2_id; otherwise update driver1_id
        const isSameTruck = formData.truck_id === originalAssignmentRef.current.truckId;
        const keepAsDriver2 = isDriver2Ref.current && isSameTruck;

        const truckUpdatePayload: Record<string, any> = {
          trailer_id: formData.trailer_id || null,
          company_id: formData.company_id || null,
        };
        if (keepAsDriver2) {
          truckUpdatePayload.driver2_id = editingDriver.id;
        } else {
          truckUpdatePayload.driver1_id = editingDriver.id;
        }

        const { error: truckError } = await supabase
          .from("trucks")
          .update(truckUpdatePayload)
          .eq("id", formData.truck_id);
        if (truckError) throw truckError;

        // Now safely clear driver from other trucks (excluding the one we just assigned)
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

        // Clear trailer from old truck when driver moves to a new truck
        if (origTruckId && formData.truck_id !== origTruckId) {
          await supabase.from("trucks").update({ trailer_id: null }).eq("id", origTruckId);
        }
      } else if (formData.trailer_id && existingTruckId) {
        // Only trailer is selected and driver has an existing truck - update trailer on existing truck
        await supabase
          .from("trucks")
          .update({ trailer_id: null })
          .eq("trailer_id", formData.trailer_id)
          .neq("id", existingTruckId);

        // Update existing truck with trailer and inherit driver's company
        const { error: trailerError } = await supabase
          .from("trucks")
          .update({
            driver1_id: editingDriver.id,
            trailer_id: formData.trailer_id,
            company_id: formData.company_id || null,
          })
          .eq("id", existingTruckId);
        if (trailerError) throw trailerError;
      } else if (formData.trailer_id && !existingTruckId) {
        // Only trailer selected but no existing truck - can't assign trailer without truck
        toast({
          title: "Warning",
          description:
            "Cannot assign a trailer without a truck. Please select a truck or assign the driver to a truck first.",
          variant: "destructive",
        });
        throw new Error("Cannot assign trailer without truck");
      } else if (!formData.truck_id && !formData.trailer_id) {
        // Both truck and trailer are cleared - remove driver from all trucks
        await supabase.from("trucks").update({ driver1_id: null }).eq("driver1_id", editingDriver.id);

        await supabase.from("trucks").update({ driver2_id: null }).eq("driver2_id", editingDriver.id);
      }

      // Insert assignment history with reason if there was a change
      // HARDENED: Include old_ values for accurate "from → to" display
      if (reason && (truckChanged || trailerChanged)) {
        const { data: userData } = await supabase.auth.getUser();
        let changeType = "assignment_change";
        if (truckChanged && !trailerChanged) {
          changeType = "driver_assignment";
        } else if (!truckChanged && trailerChanged) {
          changeType = "trailer_assignment";
        }

        await supabase.from("assignment_history").insert({
          truck_id: formData.truck_id || origTruckId || null,
          trailer_id: formData.trailer_id || origTrailerId || null,
          driver1_id: editingDriver.id,
          driver2_id: null,
          // HARDENED: Include old values for deterministic display
          old_truck_id: origTruckId || null,
          old_trailer_id: origTrailerId || null,
          old_driver1_id: editingDriver.id,
          old_driver2_id: null,
          change_type: changeType,
          changed_by: userData?.user?.id || null,
          reason: reason,
        });
      }

      toast({
        title: "Success",
        description: "Driver updated successfully",
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-history"] });
    } catch (error: any) {
      let errorMessage = error.message || "Failed to update driver";

      // Check for duplicate email error
      if (error.message?.includes("duplicate key value") && error.message?.includes("drivers_email_key")) {
        errorMessage = "A driver with this email already exists. Please use a different email.";
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
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
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      // Save termination note
      const { error: noteError } = await supabase.from("driver_termination_notes").insert({
        driver_id: editingDriver.id,
        note: terminationNote.trim(),
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (noteError) throw noteError;

      // Set termination date, mark as inactive, clear dispatcher and 2-week notice
      const { error: driverError } = await supabase
        .from("drivers")
        .update({
          is_active: false,
          termination_date: new Date().toISOString().split("T")[0],
          dispatcher_id: null,
          two_week_block_date: null,
        })
        .eq("id", editingDriver.id);
      if (driverError) throw driverError;

      // Find and disconnect truck/trailer
      const { data: truck, error: truckFindError } = await supabase
        .from("trucks")
        .select("id, driver1_id, driver2_id, company_id")
        .or(`driver1_id.eq.${editingDriver.id},driver2_id.eq.${editingDriver.id}`)
        .maybeSingle();
      if (truckFindError) throw truckFindError;
      if (truck) {
        // Determine which driver field to clear
        const updateData: any = {
          trailer_id: null,
        };
        if (truck.driver1_id === editingDriver.id) {
          updateData.driver1_id = null;
        }
        if (truck.driver2_id === editingDriver.id) {
          updateData.driver2_id = null;
        }
        const { error: truckUpdateError } = await supabase.from("trucks").update(updateData).eq("id", truck.id);
        if (truckUpdateError) throw truckUpdateError;
      }
      toast({
        title: "Success",
        description: `${formData.first_name} ${formData.last_name} has been marked as done and removed from active drivers`,
      });
      setTerminationNote("");
      setShowNoteDialog(false);
      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      refetch();

      // Invalidate reports cache so Reports page updates immediately
      queryClient.invalidateQueries({ queryKey: ["reports"] });

      fetchTerminationNotes(editingDriver.id);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to mark driver as done",
        variant: "destructive",
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
      const { error: deleteError } = await supabase
        .from("driver_termination_notes")
        .delete()
        .eq("driver_id", editingDriver.id);
      if (deleteError) throw deleteError;

      // Reactivate driver and clear termination date
      const { error: driverError } = await supabase
        .from("drivers")
        .update({
          is_active: true,
          termination_date: null,
        })
        .eq("id", editingDriver.id);
      if (driverError) throw driverError;
      toast({
        title: "Success",
        description: `${formData.first_name} ${formData.last_name} has been reactivated`,
      });
      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      // Invalidate all related queries to sync with other pages
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reactivate driver",
        variant: "destructive",
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
        const { error } = await supabase
          .from("drivers")
          .update({
            two_week_block_date: null,
          })
          .eq("id", editingDriver.id);
        if (error) throw error;

        // Delete the GAME-OVER order if it exists
        await supabase.from("orders").delete().eq("driver1_id", editingDriver.id).eq("load_number", "GAME-OVER");
        toast({
          title: "Success",
          description: "2-week block cancelled",
        });
        setIsEditDialogOpen(false);
        setEditingDriver(null);
        resetForm();
        refetch();
        queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to cancel 2-week block",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Show dialog to select start date
    setTwoWeekNoticeDialog(true);
  };

  const handleSetTwoWeekNotice = async () => {
    if (!editingDriver || !twoWeekNoticeDate) return;

    setIsSubmitting(true);
    try {
      const blockDate = format(twoWeekNoticeDate, "yyyy-MM-dd");

      const { error: blockError } = await supabase
        .from("drivers")
        .update({
          two_week_block_date: blockDate,
        })
        .eq("id", editingDriver.id);
      if (blockError) throw blockError;
      toast({
        title: "Success",
        description: "2-week notice set successfully",
      });
      setTwoWeekNoticeDialog(false);
      setTwoWeekNoticeDate(new Date());
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      resetForm();
      refetch();
      queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to set 2-week notice",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteDriver = async (driverId: string) => {
    try {
      // Get driver data to save to history
      const { data: driverData, error: fetchError } = await supabase
        .from("drivers")
        .select("*")
        .eq("id", driverId)
        .single();

      if (fetchError) throw fetchError;

      // Save driver name to orders and nullify driver1_id before deletion
      await supabase
        .from("orders")
        .update({ deleted_driver1_name: driverData.name, driver1_id: null })
        .eq("driver1_id", driverId);

      // Save driver name to orders and nullify driver2_id before deletion
      await supabase
        .from("orders")
        .update({ deleted_driver2_name: driverData.name, driver2_id: null })
        .eq("driver2_id", driverId);

      // Save to deleted_drivers history table (insert-only; ignore duplicates)
      const { error: historyError } = await supabase.from("deleted_drivers").upsert(
        {
          id: driverData.id,
          first_name: driverData.first_name,
          last_name: driverData.last_name,
          name: driverData.name,
          phone: driverData.phone,
          email: driverData.email,
          company_id: driverData.company_id,
          dispatcher_id: driverData.dispatcher_id,
          home_address: driverData.home_address,
          home_city: driverData.home_city,
          home_state: driverData.home_state,
          home_latitude: driverData.home_latitude,
          home_longitude: driverData.home_longitude,
          cdl_number: driverData.cdl_number,
          cdl_expiration_date: driverData.cdl_expiration_date,
          medical_card_expiration_date: driverData.medical_card_expiration_date,
          random_drug_test_date: driverData.random_drug_test_date,
          hire_date: driverData.hire_date,
          termination_date: driverData.termination_date,
          mvr_date: driverData.mvr_date,
          clearing_house: driverData.clearing_house,
          license_number: driverData.license_number,
          company_name: driverData.company_name,
          company_address: driverData.company_address,
          mc_number: driverData.mc_number,
          weekly_payment: driverData.weekly_payment == null ? null : Math.round(Number(driverData.weekly_payment)),
          weeks_count: driverData.weeks_count == null ? null : Math.round(Number(driverData.weeks_count)),
          agreement_start_date: driverData.agreement_start_date,
          is_active: driverData.is_active,
          is_recovery: driverData.is_recovery,
          is_company_driver: driverData.is_company_driver,
          cents_per_mile: driverData.cents_per_mile == null ? null : Math.round(Number(driverData.cents_per_mile)),
          going_yard: driverData.going_yard,
          two_week_block_date: driverData.two_week_block_date,
          is_checked_for_termination: driverData.is_checked_for_termination,
          emergency_contact_name: driverData.emergency_contact_name,
          emergency_contact_relation: driverData.emergency_contact_relation,
          emergency_contact_phone: driverData.emergency_contact_phone,
          deleted_by: profile?.user_id,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );

      if (historyError) throw historyError;

      // Note: Foreign key constraints now handle cascading deletes (truck_notes, truck_note_history, lost_day_notes)
      // and SET NULL for nullable references (trucks.driver1_id, trucks.driver2_id, orders.*, recovery_history.*)

      // Delete from drivers
      const { error } = await supabase.from("drivers").delete().eq("id", driverId);
      if (error) throw error;

      toast({
        title: "Success",
        description: "Driver deleted and archived successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete driver",
        variant: "destructive",
      });
    }
  };

  const exportToExcel = () => {
    const exportData = filteredDrivers.map((driver: any) => ({
      Name: driver.name || "",
      Phone: driver.phone || "",
      Email: driver.email || "",
      "Home City": driver.home_city || "",
      "Home State": driver.home_state || "",
      "Truck #": driver.truck_info?.truck_number || "",
      "Trailer #": driver.truck_info?.trailer_number || "",
      Dispatcher: driver.dispatcher_info?.full_name || "",
      Company: driver.company?.name || "",
      "CDL #": driver.cdl_number || "",
      "CDL Exp.": driver.cdl_expiration_date || "",
      "Medical Exp.": driver.medical_card_expiration_date || "",
      "Hire Date": driver.hire_date || "",
      Status: driver.is_active ? "Active" : "Inactive",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Drivers");
    XLSX.writeFile(wb, `drivers_export_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "Export Complete",
      description: `Exported ${exportData.length} drivers to Excel`,
    });
  };
  const openEditDialog = async (driver: any) => {
    setEditingDriver(driver);
    fetchTerminationNotes(driver.id);

    // Get current truck assignment
    const { data: truckData } = await supabase
      .from("trucks")
      .select("id, trailer_id, driver1_id, driver2_id")
      .or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id}`)
      .maybeSingle();

    // Track whether this driver is in the driver2 slot
    isDriver2Ref.current = !!(truckData && truckData.driver2_id === driver.id && truckData.driver1_id !== driver.id);

    // Store original assignment for reason dialog check
    originalAssignmentRef.current = {
      truckId: truckData?.id || null,
      trailerId: truckData?.trailer_id || null,
    };

    // Fetch sensitive PII if user has permission
    let sensitivePIIData = null;
    if (canViewSensitiveData) {
      const { data } = await supabase.from("driver_sensitive_pii").select("*").eq("driver_id", driver.id).maybeSingle();
      sensitivePIIData = data;
    }
    setFormData({
      first_name: driver.first_name || "",
      last_name: driver.last_name || "",
      phone: driver.phone || "",
      email: driver.email || "",
      company_id: driver.company_id || "",
      emergency_contact_name: driver.emergency_contact_name || "",
      emergency_contact_relation: driver.emergency_contact_relation || "",
      emergency_contact_phone: driver.emergency_contact_phone || "",
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
      drugTestResult: null,
      is_company_driver: driver.is_company_driver || false,
      is_recovery: driver.is_recovery || false,
      do_not_touch_hos: driver.do_not_touch_hos || false,
      hazmat: driver.hazmat || false,
      tanker: driver.tanker || false,
      twic: driver.twic || false,
      citizen: driver.citizen !== false,
      criminal: driver.criminal || false,
      straps: driver.straps ?? 2,
      load_bars: driver.load_bars ?? 0,
      cents_per_mile: driver.cents_per_mile?.toString() || "",
      note: driver.note || "",
    });
    if (truckData?.id) {
      setSelectedTruckId(truckData.id);
    }
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

  // Get the truck ID for the driver being edited (check both driver1 and driver2 slots)
  const editingDriverTruckId = editingDriver
    ? allTrucks?.find((truck) => truck.driver1_id === editingDriver.id || truck.driver2_id === editingDriver.id)?.id
    : null;

  // Filter out trucks that are already assigned to other drivers
  const availableTrucks =
    allTrucks?.filter((truck) => {
      // If we're editing a driver, allow their currently assigned truck to remain in the list
      if (editingDriver && truck.id === editingDriverTruckId) {
        return true;
      }
      // Truck is available if it has no driver assigned
      return !truck.driver1_id;
    }) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground px-[10px]">Drivers</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Driver
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Driver</DialogTitle>
              </DialogHeader>

              <Tabs value={addDialogTab} onValueChange={setAddDialogTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="info">Driver Info</TabsTrigger>
                  <TabsTrigger value="files">Driver Files</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                  <form id="add-driver-form" onSubmit={handleAddDriver} className="space-y-4">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="first_name">First Name*</Label>
                        <Input
                          id="first_name"
                          value={formData.first_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              first_name: e.target.value.trimStart(),
                            })
                          }
                          placeholder="John"
                          required
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="last_name">Last Name*</Label>
                        <Input
                          id="last_name"
                          value={formData.last_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              last_name: e.target.value.trimStart(),
                            })
                          }
                          placeholder="Smith"
                          required
                        />
                      </div>
                      <div className="space-y-2 col-span-3">
                        <Label htmlFor="phone">Phone *</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              phone: formatPhoneNumber(e.target.value),
                            })
                          }
                          placeholder="(555) 123-4567"
                          required
                        />
                      </div>
                      <div className="space-y-2 col-span-4">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              email: e.target.value,
                            })
                          }
                          placeholder="john.smith@company.com"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company">Company *</Label>
                      <Select
                        value={formData.company_id}
                        onValueChange={(value) => setFormData({ ...formData, company_id: value })}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select company..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(companies || []).map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="emergency_contact_name">Emergency Contact Name</Label>
                        <Input
                          id="emergency_contact_name"
                          value={formData.emergency_contact_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              emergency_contact_name: e.target.value,
                            })
                          }
                          placeholder="Jane Doe"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emergency_contact_relation">Relation</Label>
                        <Input
                          id="emergency_contact_relation"
                          value={formData.emergency_contact_relation}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              emergency_contact_relation: e.target.value,
                            })
                          }
                          placeholder="Spouse"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emergency_contact_phone">Emergency Contact Phone</Label>
                        <Input
                          id="emergency_contact_phone"
                          value={formData.emergency_contact_phone}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              emergency_contact_phone: formatPhoneNumber(e.target.value),
                            })
                          }
                          placeholder="(555) 987-6543"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="truck">Truck Number</Label>
                        <Combobox
                          options={(availableTrucks || []).map((truck) => ({
                            value: truck.id,
                            label: truck.truck_number,
                          }))}
                          value={formData.truck_id}
                          onValueChange={(value) => {
                            const selectedTruck = availableTrucks?.find((truck) => truck.id === value);
                            setFormData({
                              ...formData,
                              truck_id: value,
                              trailer_id: selectedTruck?.trailer_id || "",
                              company_id:
                                formData.company_id ||
                                (selectedTruck as any)?.company_id ||
                                "",
                              dispatcher_id:
                                formData.dispatcher_id ||
                                (selectedTruck as any)?.dispatcher_id ||
                                "",
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
                          options={(availableTrailers || []).map((trailer) => ({
                            value: trailer.id,
                            label: trailer.trailer_number,
                          }))}
                          value={formData.trailer_id}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              trailer_id: value,
                            })
                          }
                          placeholder={formData.truck_id ? "Select trailer..." : "Select truck first"}
                          emptyText="No available trailers"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                      <div className="space-y-2">
                        <Label htmlFor="weekly_payment">Weekly Payment</Label>
                        <Input
                          id="weekly_payment"
                          type="number"
                          step="1"
                          value={formData.weekly_payment}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              weekly_payment: e.target.value,
                            })
                          }
                          placeholder="Weekly Payment"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="weeks_count">Weeks</Label>
                        <Input
                          id="weeks_count"
                          type="number"
                          step="1"
                          value={formData.weeks_count}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              weeks_count: e.target.value,
                            })
                          }
                          placeholder="Weeks"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="agreement_start_date">Agreement Start Date</Label>
                        <Input
                          id="agreement_start_date"
                          type="date"
                          value={formData.agreement_start_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              agreement_start_date: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dispatcher">Dispatcher</Label>
                      <Select
                        value={formData.dispatcher_id}
                        onValueChange={(value) => setFormData({ ...formData, dispatcher_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select dispatcher..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allDispatchers.map((dispatcher) => (
                            <SelectItem key={dispatcher.id} value={dispatcher.id}>
                              {dispatcher.full_name || dispatcher.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="border-t pt-4">
                      <div className="grid grid-cols-12 gap-4">
                        <div className="space-y-2 col-span-7">
                          <Label htmlFor="home_address">Home Address</Label>
                          <Input
                            id="home_address"
                            value={formData.home_address}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                home_address: e.target.value,
                              })
                            }
                            placeholder="1234 Oak Street"
                          />
                        </div>
                        <div className="space-y-2 col-span-3">
                          <Label htmlFor="home_city">Home City *</Label>
                          <Input
                            id="home_city"
                            value={formData.home_city}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                home_city: e.target.value,
                              })
                            }
                            placeholder="Chicago"
                            required
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label htmlFor="home_state">Home State *</Label>
                          <Input
                            id="home_state"
                            value={formData.home_state}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                home_state: e.target.value,
                              })
                            }
                            placeholder="IL"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    {canViewSensitiveData && (
                      <>
                        <div className="border-t pt-4" />

                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="company_name">Driver's Company Name</Label>
                              <Input
                                id="company_name"
                                value={formData.company_name}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    company_name: e.target.value,
                                  })
                                }
                                placeholder="Bob's Company"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="company_address">Driver's Company Address</Label>
                              <Input
                                id="company_address"
                                value={formData.company_address}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    company_address: e.target.value,
                                  })
                                }
                                placeholder="Company Address"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cdl_number">CDL Number</Label>
                        <Input
                          id="cdl_number"
                          value={formData.cdl_number}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              cdl_number: e.target.value,
                            })
                          }
                          placeholder="CDL Number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cdl_expiration_date">CDL Expiration Date</Label>
                        <Input
                          id="cdl_expiration_date"
                          type="date"
                          value={formData.cdl_expiration_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              cdl_expiration_date: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="hire_date">Hire Date</Label>
                        <Input
                          id="hire_date"
                          type="date"
                          value={formData.hire_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              hire_date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="termination_date">Termination Date</Label>
                        <Input
                          id="termination_date"
                          type="date"
                          value={formData.termination_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              termination_date: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="mvr_date">MVR Date</Label>
                        <Input
                          id="mvr_date"
                          type="date"
                          value={formData.mvr_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              mvr_date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="medical_card_expiration_date">Medical Card Expiration Date</Label>
                        <Input
                          id="medical_card_expiration_date"
                          type="date"
                          value={formData.medical_card_expiration_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              medical_card_expiration_date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="random_drug_test_date">Random Drug Test Date</Label>
                        <Input
                          id="random_drug_test_date"
                          type="date"
                          value={formData.random_drug_test_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              random_drug_test_date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="clearing_house">Clearing House</Label>
                        <Input
                          id="clearing_house"
                          value={formData.clearing_house}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              clearing_house: e.target.value,
                            })
                          }
                          placeholder="Clearing house number"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Drug Test Result</Label>
                      <Select
                        value={formData.drugTestResult || "pending"}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            drugTestResult: value as "positive" | "negative" | "pending",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select result" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="negative">Negative</SelectItem>
                          <SelectItem value="positive">Positive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Note</Label>
                        <TranslateNoteButton
                          text={formData.note || ""}
                          onReplace={(t) => setFormData({ ...formData, note: t })}
                        />
                      </div>
                      <Textarea
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="Driver note..."
                        rows={2}
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="is_company_driver"
                          checked={formData.is_company_driver}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              is_company_driver: checked === true,
                              cents_per_mile: checked ? formData.cents_per_mile : "",
                            })
                          }
                        />
                        <Label htmlFor="is_company_driver" className="cursor-pointer">
                          Company Driver
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="is_recovery"
                          checked={formData.is_recovery}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              is_recovery: checked === true,
                            })
                          }
                        />
                        <Label htmlFor="is_recovery" className="cursor-pointer">
                          Recovery Driver
                        </Label>
                      </div>
                      {formData.is_company_driver && (
                        <div className="flex items-center gap-2">
                          <Input
                            id="cents_per_mile"
                            type="number"
                            min="1"
                            step="1"
                            value={formData.cents_per_mile}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "" || (parseInt(value) > 0 && Number.isInteger(parseFloat(value)))) {
                                setFormData({
                                  ...formData,
                                  cents_per_mile: value,
                                });
                              }
                            }}
                            placeholder="60"
                            className="w-24"
                          />
                          <span className="text-sm text-muted-foreground">cents/mile</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="add_hazmat"
                          checked={formData.hazmat}
                          onCheckedChange={(checked) => setFormData({ ...formData, hazmat: checked === true })}
                        />
                        <Label htmlFor="add_hazmat" className="cursor-pointer">
                          Hazmat
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="add_tanker"
                          checked={formData.tanker}
                          onCheckedChange={(checked) => setFormData({ ...formData, tanker: checked === true })}
                        />
                        <Label htmlFor="add_tanker" className="cursor-pointer">
                          Tanker
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="add_twic"
                          checked={formData.twic}
                          onCheckedChange={(checked) => setFormData({ ...formData, twic: checked === true })}
                        />
                        <Label htmlFor="add_twic" className="cursor-pointer">
                          TWIC
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="add_citizen"
                          checked={formData.citizen}
                          onCheckedChange={(checked) => setFormData({ ...formData, citizen: checked === true })}
                        />
                        <Label htmlFor="add_citizen" className="cursor-pointer">
                          Citizen
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="add_criminal"
                          checked={formData.criminal}
                          onCheckedChange={(checked) => setFormData({ ...formData, criminal: checked === true })}
                        />
                        <Label htmlFor="add_criminal" className="cursor-pointer">
                          Criminal
                        </Label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="space-y-2">
                        <Label htmlFor="add_straps">Straps</Label>
                        <Input
                          id="add_straps"
                          type="number"
                          min={0}
                          value={formData.straps}
                          onChange={(e) =>
                            setFormData({ ...formData, straps: Math.max(0, parseInt(e.target.value) || 0) })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add_load_bars">Load Bars</Label>
                        <Input
                          id="add_load_bars"
                          type="number"
                          min={0}
                          value={formData.load_bars}
                          onChange={(e) =>
                            setFormData({ ...formData, load_bars: Math.max(0, parseInt(e.target.value) || 0) })
                          }
                        />
                      </div>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="files">
                  {newlyCreatedDriverId ? (
                    <DriverFilesManager
                      driverId={newlyCreatedDriverId}
                      driverName={`${formData.first_name} ${formData.last_name}`.trim()}
                    />
                  ) : (
                    <DriverFilesManagerPending
                      pendingFiles={pendingFiles}
                      onFilesChange={setPendingFiles}
                      isUploading={isUploadingFiles}
                    />
                  )}
                </TabsContent>
              </Tabs>

              {/* Action buttons - appear on all tabs */}
              <div className="mt-6">
                {newlyCreatedDriverId ? (
                  <div className="flex justify-end gap-3">
                    <Button
                      onClick={() => {
                        resetForm();
                        setIsAddDialogOpen(false);
                      }}
                    >
                      Done
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="submit"
                    disabled={isSubmitting || isUploadingFiles}
                    className="w-full"
                    onClick={(e) => {
                      e.preventDefault();
                      const form = document.getElementById("add-driver-form") as HTMLFormElement;
                      if (form) form.requestSubmit();
                    }}
                  >
                    {isSubmitting || isUploadingFiles ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isUploadingFiles ? "Uploading Files..." : "Adding Driver..."}
                      </>
                    ) : (
                      "Add Driver"
                    )}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Driver Directory</CardTitle>
            <div className="flex items-center gap-3">
              <Select
                value={statusFilter}
                onValueChange={(value: any) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Drivers</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={truckFilter}
                onValueChange={(value: any) => {
                  setTruckFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Trucks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trucks</SelectItem>
                  <SelectItem value="assigned">With Truck</SelectItem>
                  <SelectItem value="unassigned">No Truck</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={recoveryFilter}
                onValueChange={(value: any) => {
                  setRecoveryFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="recovery">Recovery Only</SelectItem>
                  <SelectItem value="regular">Regular Only</SelectItem>
                </SelectContent>
              </Select>

              <div className="w-[160px]">
                <Combobox
                  options={[
                    { value: "all", label: "All Companies" },
                    ...(companies?.map((company) => ({
                      value: company.id,
                      label: company.name,
                    })) || []),
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

              <div className="w-[160px]">
                <Combobox
                  options={[
                    { value: "all", label: "All Home States" },
                    ...US_STATES.map((state) => ({
                      value: state.value,
                      label: `${state.label} (${state.value})`,
                    })),
                  ]}
                  value={homeStateFilter}
                  onValueChange={(value) => {
                    setHomeStateFilter(value);
                    setCurrentPage(1);
                  }}
                  placeholder="Home State"
                  searchPlaceholder="Search home state..."
                  emptyText="No state found."
                />
              </div>

              <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search drivers by name, email, phone, truck, city..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex-1">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Name</TableHead>
                  <TableHead className="w-[140px]">Company</TableHead>
                  {statusFilter === "inactive" ? (
                    <>
                      <TableHead
                        className="w-[120px] cursor-pointer select-none"
                        onClick={() => handleInactiveSort("hire_date")}
                      >
                        Hire Date {inactiveSortField === "hire_date" ? (inactiveSortDir === "asc" ? "↑" : "↓") : ""}
                      </TableHead>
                      <TableHead
                        className="w-[120px] cursor-pointer select-none"
                        onClick={() => handleInactiveSort("termination_date")}
                      >
                        Termination Date{" "}
                        {inactiveSortField === "termination_date" ? (inactiveSortDir === "asc" ? "↑" : "↓") : ""}
                      </TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="w-[70px]">Truck #</TableHead>
                      <TableHead className="w-[70px]">Trailer #</TableHead>
                      <TableHead className="w-[140px]">Dispatcher</TableHead>
                    </>
                  )}
                  <TableHead className="w-[220px]">Contact</TableHead>
                  <TableHead className="w-[120px]">Home Location</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDrivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No drivers found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDrivers.map((driver: any) => (
                    <TableRow key={driver.id} className={!driver.is_active ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="truncate">{driver.name}</span>
                          {!driver.is_active && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground flex-shrink-0">
                              Inactive
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="truncate">{driver.company?.name || "—"}</TableCell>
                      {statusFilter === "inactive" ? (
                        <>
                          <TableCell className="whitespace-nowrap">
                            {driver.hire_date ? format(new Date(driver.hire_date + "T00:00:00"), "MM/dd/yyyy") : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {driver.termination_date
                              ? format(new Date(driver.termination_date + "T00:00:00"), "MM/dd/yyyy")
                              : "—"}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="whitespace-nowrap">{driver.truck_info?.truck_number || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {driver.truck_info?.trailer_number || "—"}
                          </TableCell>
                          <TableCell className="truncate">
                            {driver.dispatcher_info?.full_name || driver.dispatcher_info?.email || "—"}
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {driver.phone && (
                            <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                              <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              {driver.phone}
                            </div>
                          )}
                          {driver.email && (
                            <div className="flex items-center gap-2 text-sm overflow-hidden">
                              <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{driver.email}</span>
                            </div>
                          )}
                          {!driver.phone && !driver.email && "—"}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {driver.home_city && driver.home_state
                          ? `${driver.home_city}, ${driver.home_state}`
                          : driver.home_city || driver.home_state || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(driver)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setHistoryDriverId(driver.id);
                              setHistoryDriverName(driver.name);
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
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {/* Empty rows to maintain consistent table height */}
                {paginatedDrivers.length > 0 &&
                  Array.from({
                    length: itemsPerPage - paginatedDrivers.length,
                  }).map((_, index) => (
                    <TableRow key={`empty-${index}`} className="hover:bg-transparent">
                      <TableCell colSpan={7} className="h-[57px]">
                        &nbsp;
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filteredDrivers.length > itemsPerPage && (
            <div className="flex items-center justify-between px-2 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredDrivers.length)} of {filteredDrivers.length}{" "}
                drivers
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
              <form id="edit-driver-form" onSubmit={handleEditFormSubmit} className="space-y-4">
                <div className="grid grid-cols-12 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="edit_first_name">First Name*</Label>
                    <Input
                      id="edit_first_name"
                      value={formData.first_name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          first_name: e.target.value,
                        })
                      }
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="edit_last_name">Last Name*</Label>
                    <Input
                      id="edit_last_name"
                      value={formData.last_name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          last_name: e.target.value,
                        })
                      }
                      placeholder="Smith"
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-3">
                    <Label htmlFor="edit_phone">Phone</Label>
                    <Input
                      id="edit_phone"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          phone: formatPhoneNumber(e.target.value),
                        })
                      }
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="space-y-2 col-span-4">
                    <Label htmlFor="edit_email">Email</Label>
                    <Input
                      id="edit_email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          email: e.target.value,
                        })
                      }
                      placeholder="john.smith@company.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_company">Company*</Label>
                  <Combobox
                    options={(companies || []).map((company) => ({ value: company.id, label: company.name }))}
                    value={formData.company_id}
                    onValueChange={(value) => setFormData({ ...formData, company_id: value })}
                    placeholder="Select company..."
                    emptyText="No companies found"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_emergency_contact_name">Emergency Contact Name</Label>
                    <Input
                      id="edit_emergency_contact_name"
                      value={formData.emergency_contact_name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergency_contact_name: e.target.value,
                        })
                      }
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_emergency_contact_relation">Relation</Label>
                    <Input
                      id="edit_emergency_contact_relation"
                      value={formData.emergency_contact_relation}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergency_contact_relation: e.target.value,
                        })
                      }
                      placeholder="Spouse"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_emergency_contact_phone">Emergency Contact Phone</Label>
                    <Input
                      id="edit_emergency_contact_phone"
                      value={formData.emergency_contact_phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergency_contact_phone: formatPhoneNumber(e.target.value),
                        })
                      }
                      placeholder="(555) 987-6543"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-4 items-end">
                  <div className="space-y-2 col-span-5">
                    <Label htmlFor="edit_truck">Truck Number</Label>
                    <Combobox
                      options={(trucks?.filter((t) => t.is_active !== false) || []).map((truck) => ({
                        value: truck.id,
                        label: truck.truck_number,
                      }))}
                      value={formData.truck_id}
                      onValueChange={(value) => {
                        setFormData({
                          ...formData,
                          truck_id: value,
                          // Keep current trailer - don't auto-fill from new truck
                        });
                        setSelectedTruckId(value);
                      }}
                      placeholder="Select truck..."
                      emptyText="No trucks found"
                    />
                  </div>
                  <div className="space-y-2 col-span-5">
                    <Label htmlFor="edit_trailer">Trailer Number</Label>
                    <Combobox
                      options={(trailers || []).map((trailer) => ({
                        value: trailer.id,
                        label: trailer.trailer_number,
                      }))}
                      value={formData.trailer_id}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          trailer_id: value,
                        })
                      }
                      placeholder={formData.truck_id ? "Select trailer..." : "Select truck first"}
                      emptyText="No trailers found"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          truck_id: "",
                          trailer_id: "",
                        })
                      }
                      className="w-full"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="edit_weekly_payment">Weekly Payment</Label>
                    <Input
                      id="edit_weekly_payment"
                      type="number"
                      step="1"
                      value={formData.weekly_payment}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          weekly_payment: e.target.value,
                        })
                      }
                      placeholder="Weekly Payment"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_weeks_count">Weeks</Label>
                    <Input
                      id="edit_weeks_count"
                      type="number"
                      step="1"
                      value={formData.weeks_count}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          weeks_count: e.target.value,
                        })
                      }
                      placeholder="Weeks"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_agreement_start_date">Agreement Start Date</Label>
                    <Input
                      id="edit_agreement_start_date"
                      type="date"
                      value={formData.agreement_start_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          agreement_start_date: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_dispatcher">Dispatcher</Label>
                  <Combobox
                    options={allDispatchers.map((d) => ({ value: d.id, label: d.full_name || d.email }))}
                    value={formData.dispatcher_id}
                    onValueChange={(value) => setFormData({ ...formData, dispatcher_id: value })}
                    placeholder="Select dispatcher..."
                    emptyText="No dispatchers found"
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="space-y-2 col-span-7">
                      <Label htmlFor="edit_home_address">Home Address</Label>
                      <Input
                        id="edit_home_address"
                        value={formData.home_address}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            home_address: e.target.value,
                          })
                        }
                        placeholder="1234 Oak Street"
                      />
                    </div>
                    <div className="space-y-2 col-span-3">
                      <Label htmlFor="edit_home_city">Home City</Label>
                      <Input
                        id="edit_home_city"
                        value={formData.home_city}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            home_city: e.target.value,
                          })
                        }
                        placeholder="Chicago"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="edit_home_state">Home State</Label>
                      <Input
                        id="edit_home_state"
                        value={formData.home_state}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            home_state: e.target.value,
                          })
                        }
                        placeholder="IL"
                      />
                    </div>
                  </div>
                </div>

                {canViewSensitiveData && (
                  <>
                    <div className="border-t pt-4" />

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit_company_name">Driver's Company Name</Label>
                          <Input
                            id="edit_company_name"
                            value={formData.company_name}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                company_name: e.target.value,
                              })
                            }
                            placeholder="Bob's Company"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit_company_address">Driver's Company Address</Label>
                          <Input
                            id="edit_company_address"
                            value={formData.company_address}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                company_address: e.target.value,
                              })
                            }
                            placeholder="Company Address"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="space-y-2">
                          <Label htmlFor="edit_ssn">SSN #</Label>
                          <Input
                            id="edit_ssn"
                            value={formData.ssn}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                ssn: e.target.value,
                              })
                            }
                            placeholder="SSN"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit_fein">FEIN #</Label>
                          <Input
                            id="edit_fein"
                            value={formData.fein}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                fein: e.target.value,
                              })
                            }
                            placeholder="FEIN"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_cdl_number">CDL Number</Label>
                    <Input
                      id="edit_cdl_number"
                      value={formData.cdl_number}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cdl_number: e.target.value,
                        })
                      }
                      placeholder="CDL Number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_cdl_expiration_date">CDL Expiration Date</Label>
                    <Input
                      id="edit_cdl_expiration_date"
                      type="date"
                      value={formData.cdl_expiration_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cdl_expiration_date: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_hire_date">Hire Date</Label>
                    <Input
                      id="edit_hire_date"
                      type="date"
                      value={formData.hire_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          hire_date: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_termination_date">Termination Date</Label>
                    <Input
                      id="edit_termination_date"
                      type="date"
                      value={formData.termination_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          termination_date: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_mvr_date">MVR Date</Label>
                    <Input
                      id="edit_mvr_date"
                      type="date"
                      value={formData.mvr_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          mvr_date: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_clearing_house">Clearing House</Label>
                    <Input
                      id="edit_clearing_house"
                      type="date"
                      value={formData.clearing_house}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          clearing_house: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_medical_card_expiration_date">Medical Card Exp</Label>
                    <Input
                      id="edit_medical_card_expiration_date"
                      type="date"
                      value={formData.medical_card_expiration_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          medical_card_expiration_date: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_random_drug_test_date">Random Drug Test</Label>
                    <Input
                      id="edit_random_drug_test_date"
                      type="date"
                      value={formData.random_drug_test_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          random_drug_test_date: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {canViewSensitiveData && (
                  <div className="grid grid-cols-1 gap-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label>Note</Label>
                      <Textarea
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="Driver note..."
                        rows={2}
                      />
                    </div>
                  </div>
                )}

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
                  {formData.is_company_driver && (
                    <div className="flex items-center gap-2">
                      <Input
                        id="edit_cents_per_mile"
                        type="number"
                        min="1"
                        step="1"
                        value={formData.cents_per_mile}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "" || (parseInt(value) > 0 && Number.isInteger(parseFloat(value)))) {
                            setFormData({
                              ...formData,
                              cents_per_mile: value,
                            });
                          }
                        }}
                        placeholder="60"
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">cents/mile</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit_hazmat"
                      checked={formData.hazmat}
                      onCheckedChange={(checked) => setFormData({ ...formData, hazmat: checked === true })}
                    />
                    <Label htmlFor="edit_hazmat" className="cursor-pointer">
                      Hazmat
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit_tanker"
                      checked={formData.tanker}
                      onCheckedChange={(checked) => setFormData({ ...formData, tanker: checked === true })}
                    />
                    <Label htmlFor="edit_tanker" className="cursor-pointer">
                      Tanker
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit_twic"
                      checked={formData.twic}
                      onCheckedChange={(checked) => setFormData({ ...formData, twic: checked === true })}
                    />
                    <Label htmlFor="edit_twic" className="cursor-pointer">
                      TWIC
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit_citizen"
                      checked={formData.citizen}
                      onCheckedChange={(checked) => setFormData({ ...formData, citizen: checked === true })}
                    />
                    <Label htmlFor="edit_citizen" className="cursor-pointer">
                      Citizen
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit_criminal"
                      checked={formData.criminal}
                      onCheckedChange={(checked) => setFormData({ ...formData, criminal: checked === true })}
                    />
                    <Label htmlFor="edit_criminal" className="cursor-pointer">
                      Criminal
                    </Label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit_straps">Straps</Label>
                    <Input
                      id="edit_straps"
                      type="number"
                      min={0}
                      value={formData.straps}
                      onChange={(e) => setFormData({ ...formData, straps: Math.max(0, parseInt(e.target.value) || 0) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_load_bars">Load Bars</Label>
                    <Input
                      id="edit_load_bars"
                      type="number"
                      min={0}
                      value={formData.load_bars}
                      onChange={(e) =>
                        setFormData({ ...formData, load_bars: Math.max(0, parseInt(e.target.value) || 0) })
                      }
                    />
                  </div>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="files">
              {editingDriver && <DriverFilesManager driverId={editingDriver.id} driverName={editingDriver.name} />}
            </TabsContent>
          </Tabs>

          {/* Action buttons - appear on all tabs */}
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
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                onClick={(e) => {
                  e.preventDefault();
                  const form = document.getElementById("edit-driver-form") as HTMLFormElement | null;
                  if (form) {
                    form.requestSubmit();
                  } else {
                    // Files tab is active and the form isn't mounted — call the submit handler directly
                    handleEditFormSubmit(e as unknown as React.FormEvent);
                  }
                }}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Driver
              </Button>
            </div>
          </div>

          {/* Termination Notes Section - Show when driver is done */}
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
                        {note.creator_name && <p className="text-xs text-muted-foreground">By: {note.creator_name}</p>}
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
              <Button
                type="button"
                onClick={handleSaveTerminationNote}
                disabled={isSubmitting || !terminationNote.trim()}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <AssignmentHistoryDialog
        entityType="driver"
        entityId={historyDriverId}
        entityName={historyDriverName}
        open={isHistoryDialogOpen}
        onOpenChange={setIsHistoryDialogOpen}
      />

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
                  Start date was:{" "}
                  {format(new Date(twoWeekNoticeDate.getTime() - 14 * 24 * 60 * 60 * 1000), "MMMM d, yyyy")}
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

      {/* Assignment Reason Dialog */}
      <AssignmentReasonDialog
        open={showReasonDialog}
        onOpenChange={(open) => {
          setShowReasonDialog(open);
          if (!open) {
            setPendingReasonType(null);
            setAssignmentConflicts([]);
          }
        }}
        changeType={pendingReasonType || "truck"}
        conflicts={assignmentConflicts}
        onConfirm={(reason) => {
          setShowReasonDialog(false);
          setAssignmentConflicts([]);
          handleEditDriverWithReason(reason);
        }}
        onCancel={() => {
          setShowReasonDialog(false);
          setPendingReasonType(null);
          setAssignmentConflicts([]);
        }}
      />
    </div>
  );
};
export default Drivers;
