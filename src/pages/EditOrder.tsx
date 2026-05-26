import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { BrokerCombobox } from "@/components/ui/broker-combobox";
import { Textarea } from "@/components/ui/textarea";
import { DateTimeRangePicker } from "@/components/ui/datetime-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  ArrowLeft,
  Upload,
  FileText,
  RefreshCw,
  Mail,
  Warehouse,
  Download,
  Eye,
  Layers,
  MapPin,
  ScanLine,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { US_STATES } from "@/lib/constants";
import { useCompanies } from "@/hooks/useCompanies";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useTrailers } from "@/hooks/useTrailers";
import { useBrokers } from "@/hooks/useBrokers";
import { supabase } from "@/integrations/supabase/client";
import { invalidateOrderFilesCacheForOrder } from "@/hooks/useReportsDateWindowAdapter";
import { getOrderFileSignedUrl } from "@/utils/orderFileSignedUrl";
import { parseAddress } from "@/utils/addressParser";
import { uploadOrderFilePreserveName } from "@/utils/orderFilesUpload";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { useToast } from "@/components/ui/use-toast";
import { useAuthContext } from "@/contexts/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { combineDateAndTime, parseSimpleDateTime } from "@/utils/dateUtils";
import { toZonedTime } from "date-fns-tz";
import { geocodeAddress } from "@/utils/mapboxRouteCalculator";
import { RecoveryLoadDialog, RecoveryData } from "@/components/RecoveryLoadDialog";
import { AddTransferDialog, AddTransferData } from "@/components/AddTransferDialog";
import { EditTransferDialog, EditTransferData } from "@/components/EditTransferDialog";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import {
  OrderSnapshot,
  generateChangeMessages,
  appendChangesToNotes,
  parseNotes,
  combineNotes,
  appendUserNote,
} from "@/utils/orderChangeTracker";
import { ChangeNoteDialog } from "@/components/ChangeNoteDialog";
import { OrderAdditionalsManager, OrderAdditionalsManagerRef } from "@/components/OrderAdditionalsManager";
import { DocumentScannerDialog } from "@/components/DocumentScannerDialog";
import { DocumentEnhanceDialog } from "@/components/DocumentEnhanceDialog";
import {
  MilesChangeReasonDialog,
  checkMilesChange,
  getMilesChangeSmsRecipients,
  buildMilesChangeSmsMessage,
} from "@/components/MilesChangeReasonDialog";
interface PickupDrop {
  id: string;
  type: "pickup" | "delivery";
  address: string;
  datetime: string;
  dateRange?: DateRange;
  startTime?: string;
  endTime?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  contactName?: string;
  contactPhone?: string;
  specialInstructions?: string;
  companyName?: string;
  latitude?: number;
  longitude?: number;
}
const EditOrder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, hasRole } = useAuthContext();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnToReports, setReturnToReports] = useState(false);
  const [returnToTrips, setReturnToTrips] = useState(false);
  const [returnToAnalytics, setReturnToAnalytics] = useState(false);

  // Check on mount if we should return to reports, trips, or analytics
  useEffect(() => {
    const shouldReturnToReports = localStorage.getItem("returnToReports") === "true";
    const shouldReturnToTrips = localStorage.getItem("returnToTrips") === "true";
    const shouldReturnToAnalytics = localStorage.getItem("returnToAnalytics") === "true";
    setReturnToReports(shouldReturnToReports);
    setReturnToTrips(shouldReturnToTrips);
    setReturnToAnalytics(shouldReturnToAnalytics);
  }, []);

  // Form states
  const [bookedByCompany, setBookedByCompany] = useState("");
  const [broker, setBroker] = useState("");
  const [truck, setTruck] = useState("");
  const [driver1, setDriver1] = useState("");
  const [driver2, setDriver2] = useState("");
  const [trailer, setTrailer] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [deletedTrailerNumber, setDeletedTrailerNumber] = useState("");
  const [brokerLoadNumber, setBrokerLoadNumber] = useState("");
  const [pickupDateRange, setPickupDateRange] = useState<DateRange>();
  const [deliveryDateRange, setDeliveryDateRange] = useState<DateRange>();
  const [freightAmount, setFreightAmount] = useState("");
  const [detention, setDetention] = useState("");
  const [layover, setLayover] = useState("");
  const [extraStop, setExtraStop] = useState("");
  // Lumper is now multi-entry, each with its own amount, optional reason, and receipt file.
  // Derived legacy `lumper` total (sum) is computed below for backward compatibility.
  const [lumperItems, setLumperItems] = useState<
    { amount: number; reason: string; file_path: string | null; file_name: string | null }[]
  >([]);
  const [uploadingLumperIndex, setUploadingLumperIndex] = useState<number | null>(null);
  const [lateFee, setLateFee] = useState("");
  const [driverPrice, setDriverPrice] = useState("");
  const [tonu, setTonu] = useState("");
  const [detentionDriver, setDetentionDriver] = useState("");
  const [layoverDriver, setLayoverDriver] = useState("");
  const [lateFeeDriver, setLateFeeDriver] = useState("");
  const [tonuDriver, setTonuDriver] = useState("");
  const [noTrackingFee, setNoTrackingFee] = useState("");
  const [noTrackingFeeDriver, setNoTrackingFeeDriver] = useState("");
  const [wrongAddressFee, setWrongAddressFee] = useState("");
  const [wrongAddressFeeDriver, setWrongAddressFeeDriver] = useState("");
  const [dhMiles, setDhMiles] = useState("");
  const [loadedMiles, setLoadedMiles] = useState("");
  // Multi-entry: each item has its own amount, driverAmount, and reason.
  // Derived totals + first reason are computed below for backward compatibility.
  const [otherChargesItems, setOtherChargesItems] = useState<
    { amount: number; driverAmount: number; reason: string }[]
  >([]);
  const [otherAdditionalsItems, setOtherAdditionalsItems] = useState<
    { amount: number; driverAmount: number; reason: string }[]
  >([]);

  // Derived legacy values (sums + combined reasons)
  const otherChargesTotal = useMemo(
    () => otherChargesItems.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    [otherChargesItems],
  );
  const otherChargesDriverTotal = useMemo(
    () => otherChargesItems.reduce((s, i) => s + (Number(i.driverAmount) || 0), 0),
    [otherChargesItems],
  );
  const otherChargesReason = useMemo(
    () =>
      otherChargesItems
        .map((i) => (i.reason || "").trim())
        .filter(Boolean)
        .join("; "),
    [otherChargesItems],
  );
  const otherAdditionalsTotal = useMemo(
    () => otherAdditionalsItems.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    [otherAdditionalsItems],
  );
  const otherAdditionalsDriverTotal = useMemo(
    () => otherAdditionalsItems.reduce((s, i) => s + (Number(i.driverAmount) || 0), 0),
    [otherAdditionalsItems],
  );
  const otherAdditionalsReason = useMemo(
    () =>
      otherAdditionalsItems
        .map((i) => (i.reason || "").trim())
        .filter(Boolean)
        .join("; "),
    [otherAdditionalsItems],
  );

  // Legacy string aliases used by calculations / save payload.
  const otherCharges = otherChargesTotal ? String(otherChargesTotal) : "";
  const otherChargesDriver = otherChargesDriverTotal ? String(otherChargesDriverTotal) : "";
  const otherAdditionals = otherAdditionalsTotal ? String(otherAdditionalsTotal) : "";
  const otherAdditionalsDriver = otherAdditionalsDriverTotal ? String(otherAdditionalsDriverTotal) : "";

  const [additionalMiles, setAdditionalMiles] = useState("");
  const [escortFee, setEscortFee] = useState("");
  const [escortFeeBrokerPaid, setEscortFeeBrokerPaid] = useState(false);

  // Calculate total company revenue and total driver pay
  const totalCompanyRevenue = useMemo(() => {
    const base = parseFloat(freightAmount) || 0;
    const det = parseFloat(detention) || 0;
    const lay = parseFloat(layover) || 0;
    const extra = parseFloat(extraStop) || 0;
    const lump = parseFloat(lumper) || 0;
    const late = parseFloat(lateFee) || 0;
    const ton = parseFloat(tonu) || 0;
    const other = parseFloat(otherCharges) || 0;
    const otherAdd = parseFloat(otherAdditionals) || 0;
    const escort = escortFeeBrokerPaid ? parseFloat(escortFee) || 0 : 0;
    const noTracking = parseFloat(noTrackingFee) || 0;
    const wrongAddr = parseFloat(wrongAddressFee) || 0;
    return base + det + lay + extra + lump - late + ton - other + otherAdd + escort - noTracking - wrongAddr;
  }, [
    freightAmount,
    detention,
    layover,
    extraStop,
    lumper,
    lateFee,
    tonu,
    otherCharges,
    otherAdditionals,
    escortFee,
    escortFeeBrokerPaid,
    noTrackingFee,
    wrongAddressFee,
  ]);
  const totalDriverPay = useMemo(() => {
    const base = parseFloat(driverPrice) || 0;
    const det = parseFloat(detentionDriver) || 0;
    const lay = parseFloat(layoverDriver) || 0;
    const late = parseFloat(lateFeeDriver) || 0;
    const ton = parseFloat(tonuDriver) || 0;
    const other = parseFloat(otherChargesDriver) || 0;
    const otherAdd = parseFloat(otherAdditionalsDriver) || 0;
    const noTracking = parseFloat(noTrackingFeeDriver) || 0;
    const wrongAddr = parseFloat(wrongAddressFeeDriver) || 0;
    return base + det + lay - late + ton - other + otherAdd - noTracking - wrongAddr;
  }, [
    driverPrice,
    detentionDriver,
    layoverDriver,
    lateFeeDriver,
    tonuDriver,
    otherChargesDriver,
    otherAdditionalsDriver,
    noTrackingFeeDriver,
    wrongAddressFeeDriver,
  ]);
  const [commodity, setCommodity] = useState("");
  const [weight, setWeight] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [puNumber, setPuNumber] = useState("");
  const [pickupsDrops, setPickupsDrops] = useState<PickupDrop[]>([]);
  const [rcFiles, setRcFiles] = useState<FileList | null>(null);
  const [bolFiles, setBolFiles] = useState<FileList | null>(null);
  const [podFiles, setPodFiles] = useState<FileList | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<FileList | null>(null);
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [systemNotes, setSystemNotes] = useState("");
  const [bookedBy, setBookedBy] = useState("");

  // Change note dialog state
  const [showChangeNoteDialog, setShowChangeNoteDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<string[]>([]);
  const [pendingSubmitEvent, setPendingSubmitEvent] = useState<React.FormEvent | null>(null);

  // Queued submit state: triggers a re-render so performSave sees updated additionals state
  const [queuedSubmit, setQueuedSubmit] = useState<{ changeNote?: string } | null>(null);
  const [internalLoadNumber, setInternalLoadNumber] = useState("");
  const [originalCompanyId, setOriginalCompanyId] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isGeneratingConfirmation, setIsGeneratingConfirmation] = useState(false);
  const [yardDialogOpen, setYardDialogOpen] = useState(false);
  const [yardOriginalMiles, setYardOriginalMiles] = useState("");
  const [yardRecoveryMiles, setYardRecoveryMiles] = useState("");
  const [yardMilesLoading, setYardMilesLoading] = useState(false);
  const [yardReason, setYardReason] = useState("");
  const [yardBolLocation, setYardBolLocation] = useState("");

  // Partial load state
  const [isPartial, setIsPartial] = useState(false);
  const [partialBrokers, setPartialBrokers] = useState<string[]>([]);
  const [partialBrokerLoadNumbers, setPartialBrokerLoadNumbers] = useState<string[]>([]);
  const [partialBookedByCompanies, setPartialBookedByCompanies] = useState<string[]>([]);

  // Email dispatch toggle states
  const [confirmationGenerated, setConfirmationGenerated] = useState(false);
  const [generatedConfirmationBlob, setGeneratedConfirmationBlob] = useState<Blob | null>(null);
  const [generatedConfirmationFilename, setGeneratedConfirmationFilename] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailFiles, setEmailFiles] = useState<File[]>([]);

  // Track original delivery date and date change notes for audit trail
  const [originalDeliveryDate, setOriginalDeliveryDate] = useState<Date | null>(null);
  const [dateChangeNotes, setDateChangeNotes] = useState("");

  // Track original order snapshot for change tracking
  const [originalSnapshot, setOriginalSnapshot] = useState<OrderSnapshot | null>(null);

  // Driver-specific pickup/delivery times for load confirmation only
  const [driverPickupDateRange, setDriverPickupDateRange] = useState<DateRange>();
  const [driverPickupStartTime, setDriverPickupStartTime] = useState("");
  const [driverPickupEndTime, setDriverPickupEndTime] = useState("");
  const [driverDeliveryDateRange, setDriverDeliveryDateRange] = useState<DateRange>();
  const [driverDeliveryStartTime, setDriverDeliveryStartTime] = useState("");
  const [driverDeliveryEndTime, setDriverDeliveryEndTime] = useState("");

  // Track visibility of additional fields
  const [showAdditionalFields, setShowAdditionalFields] = useState(false);

  // Transfer load state
  const [isRecovery, setIsRecovery] = useState(false);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [addTransferDialogOpen, setAddTransferDialogOpen] = useState(false);
  const [editTransferDialogOpen, setEditTransferDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<any>(null);
  const [orderTransfers, setOrderTransfers] = useState<any[]>([]);
  const [originalDriverName, setOriginalDriverName] = useState("");
  const [originalTruckNumber, setOriginalTruckNumber] = useState("");
  const [originalTrailerNumber, setOriginalTrailerNumber] = useState("");
  const [originalMiles, setOriginalMiles] = useState("");
  const [originalDriverPrice, setOriginalDriverPrice] = useState("");
  const [recoveryMiles, setRecoveryMiles] = useState("");
  const [recoveryDriverPrice, setRecoveryDriverPrice] = useState("");
  const [recoveryDate, setRecoveryDate] = useState("");
  const [trailersSwapped, setTrailersSwapped] = useState(false);

  // Document scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCategory, setScannerCategory] = useState<"POD" | "ADDITIONAL">("POD");

  // Document enhance state (for existing files)
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false);
  const [enhanceFileUrl, setEnhanceFileUrl] = useState("");
  const [enhanceFileName, setEnhanceFileName] = useState("");
  const [enhanceFileCategory, setEnhanceFileCategory] = useState<"POD" | "ADDITIONAL">("POD");

  // Ref for OrderAdditionalsManager
  const additionalsManagerRef = useRef<OrderAdditionalsManagerRef>(null);

  // Miles change tracking - baseline values from DB
  const [baselineDhMiles, setBaselineDhMiles] = useState<number>(0);
  const [baselineLoadedMiles, setBaselineLoadedMiles] = useState<number>(0);
  const [showMilesChangeDialog, setShowMilesChangeDialog] = useState(false);
  const [milesChangeInfo, setMilesChangeInfo] = useState<any>(null);
  const openScanner = (category: "POD" | "ADDITIONAL") => {
    setScannerCategory(category);
    setScannerOpen(true);
  };

  const openEnhanceDialog = async (file: { file_path: string; file_name: string; file_category: string }) => {
    try {
      const { data, error } = await supabase.storage.from("order-files").createSignedUrl(file.file_path, 3600);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to load file: " + error.message,
          variant: "destructive",
        });
        return;
      }

      const signedUrl = data?.signedUrl || (data as any)?.signedURL;
      if (signedUrl) {
        setEnhanceFileUrl(signedUrl);
        setEnhanceFileName(file.file_name);
        setEnhanceFileCategory(file.file_category as "POD" | "ADDITIONAL");
        setEnhanceDialogOpen(true);
      }
    } catch (err) {
      console.error("Error loading file for enhancement:", err);
      toast({
        title: "Error",
        description: "Failed to load file",
        variant: "destructive",
      });
    }
  };

  const handleEnhanceSave = (file: File) => {
    // Add the enhanced file to the appropriate file list
    const dt = new DataTransfer();
    if (enhanceFileCategory === "POD") {
      if (podFiles) Array.from(podFiles).forEach((f) => dt.items.add(f));
      dt.items.add(file);
      setPodFiles(dt.files);
    } else {
      if (additionalFiles) Array.from(additionalFiles).forEach((f) => dt.items.add(f));
      dt.items.add(file);
      setAdditionalFiles(dt.files);
    }
  };

  const handleScanCapture = (file: File) => {
    // Add the scanned file to the appropriate file list
    const dt = new DataTransfer();
    if (scannerCategory === "POD") {
      if (podFiles) Array.from(podFiles).forEach((f) => dt.items.add(f));
      dt.items.add(file);
      setPodFiles(dt.files);
    } else {
      if (additionalFiles) Array.from(additionalFiles).forEach((f) => dt.items.add(f));
      dt.items.add(file);
      setAdditionalFiles(dt.files);
    }
  };
  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent '-', 'e', 'E', and '+' characters
    if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") {
      e.preventDefault();
    }
  };
  const handleNumericChange = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string or non-negative numbers
    if (value === "" || parseFloat(value) >= 0) {
      setter(value);
    }
  };

  // Drag states for file uploads
  const [dragStates, setDragStates] = useState({
    rc: false,
    bol: false,
    pod: false,
    additional: false,
    email: false,
  });

  // File input refs for programmatic access
  const rcFileInputRef = useRef<HTMLInputElement>(null);
  const bolFileInputRef = useRef<HTMLInputElement>(null);
  const podFileInputRef = useRef<HTMLInputElement>(null);
  const additionalFileInputRef = useRef<HTMLInputElement>(null);
  const emailFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch data from database
  const { data: companies } = useCompanies();
  const { data: trucks } = useTrucks();
  const { data: drivers } = useDrivers();
  const { data: trailers } = useTrailers();
  const { data: brokers } = useBrokers();
  const [profiles, setProfiles] = useState<
    Array<{
      id: string;
      full_name: string;
    }>
  >([]);

  // Company email configuration (same as NewOrder)
  const COMPANY_EMAIL_CONFIG: Record<
    string,
    {
      sender: string;
      cc: string;
    }
  > = {
    "BF Prime LLC": {
      sender: "BF Prime Dispatch <truckload@bfprime.net>",
      cc: "dispatch@bfprime.net",
    },
    "BF Prime United LLC": {
      sender: "BF Prime United Dispatch <truckload@bfprimeunited.net>",
      cc: "dispatch@bfprimeunited.net",
    },
    "Beverly Group": {
      sender: "Beverly Group Dispatch <truckload@beverlygroupllc.net>",
      cc: "dispatch@beverlygroupllc.net",
    },
    "Beverly group": {
      sender: "Beverly Group Dispatch <truckload@beverlygroupllc.net>",
      cc: "dispatch@beverlygroupllc.net",
    },
    "Beverly Freight": {
      sender: "Beverly Freight Dispatch <truckload@beverlyfreight.net>",
      cc: "dispatch@beverlyfreight.net",
    },
    "Beverly Freight Inc": {
      sender: "Beverly Freight Dispatch <truckload@beverlyfreight.net>",
      cc: "dispatch@beverlyfreight.net",
    },
    "BG Prime Inc": {
      sender: "BG Prime Dispatch <truckload@bgprime.net>",
      cc: "dispatch@bgprime.net",
    },
    "United Enterprise Solutions INC": {
      sender: "United Enterprise Solutions Dispatch <truckload@unitedenterprisesolutions.net>",
      cc: "dispatch@unitedenterprisesolutions.net",
    },
    "AP Silver Trans LLC": {
      sender: "AP Silver Trans Dispatch <truckload@apsilvertrans.net>",
      cc: "dispatch@apsilvertrans.net",
    },
  };

  // Fetch profiles for booked by dropdown
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .not("full_name", "is", null)
        .order("full_name");
      if (data) {
        setProfiles(data);
      }
    };
    fetchProfiles();
  }, []);

  // Handle queued submit after additionals state updates
  // This effect runs in a new render where the additionals state is updated
  useEffect(() => {
    if (!queuedSubmit) return;

    const { changeNote } = queuedSubmit;
    setQueuedSubmit(null); // Clear immediately to prevent loops

    // Now run the actual submit logic with updated state
    const runQueuedSubmit = async () => {
      // Check if revised RC is required (additionals added except lumper)
      if (hasNewAdditionalsRequiringRC() && (!rcFiles || rcFiles.length === 0)) {
        toast({
          title: "Revised Rate Confirmation Required",
          description:
            "Please upload a Revised Rate Confirmation when adding additional charges (detention, layover, extra stop, late fee, TONU, etc.)",
          variant: "destructive",
        });
        return;
      }

      // If there's a change note, we already have it, just save
      if (changeNote !== undefined) {
        setIsSubmitting(true);
        await performSave(changeNote);
        setPendingChanges([]);
        setPendingSubmitEvent(null);
        return;
      }

      // Detect changes
      const changes = detectChanges();

      // If there are changes, show dialog to require user note
      if (changes.length > 0) {
        setPendingChanges(changes);
        setShowChangeNoteDialog(true);
        return;
      }

      // No changes detected, proceed with save
      setIsSubmitting(true);
      await performSave();
    };

    runQueuedSubmit();
  }, [queuedSubmit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoize loadOrderData to prevent infinite loops
  const loadOrderData = useCallback(async () => {
    console.log("Loading order data for ID:", id);
    console.log("Current URL:", window.location.href);

    // Check if id is valid UUID format
    if (!id || id === ":id" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      console.error("Invalid or missing load ID:", id);
      toast({
        title: "Invalid Load ID",
        description: "The load ID in the URL is invalid or missing",
        variant: "destructive",
      });
      const shouldReturnToReports = localStorage.getItem("returnToReports") === "true";
      const shouldReturnToYardLoads = localStorage.getItem("returnToYardLoads") === "true";
      const shouldReturnToTrips = localStorage.getItem("returnToTrips") === "true";
      const shouldReturnToOrders = localStorage.getItem("returnToOrders") === "true";
      if (shouldReturnToReports) {
        localStorage.removeItem("returnToReports");
        navigate("/reports");
      } else if (shouldReturnToYardLoads) {
        localStorage.removeItem("returnToYardLoads");
        navigate("/yard-loads");
      } else if (shouldReturnToTrips) {
        localStorage.removeItem("returnToTrips");
        navigate("/trips");
      } else if (shouldReturnToOrders) {
        navigate("/orders");
      } else {
        navigate("/orders");
      }
      return;
    }
    try {
      const { data: orderData, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          pickup_drops!inner(*),
          order_files(*),
          trailer:trailers!trailer_id(trailer_number)
        `,
        )
        .eq("id", id)
        .order("sequence_number", {
          foreignTable: "pickup_drops",
          ascending: true,
        })
        .single();
      console.log("Order data response:", {
        orderData,
        error,
      });
      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }
      if (orderData) {
        console.log("Setting form data with order:", orderData);

        // Set locked status
        setIsLocked(orderData.locked || false);
        setBookedByCompany(orderData.booked_by_company_id || "");
        setOriginalCompanyId(orderData.company_id || null);
        setBroker(orderData.broker_id || "");
        setTruck(orderData.truck_id || "");
        setTrailer(orderData.trailer?.trailer_number || (orderData as any).deleted_trailer_number || "");
        setTrailerId(orderData.trailer_id || "");
        setDeletedTrailerNumber((orderData as any).deleted_trailer_number || "");
        setDriver1(orderData.driver1_id || "");
        setDriver2(orderData.driver2_id || "");
        setBrokerLoadNumber(orderData.broker_load_number || "");
        setFreightAmount(orderData.freight_amount?.toString() || "");
        setDetention((orderData as any).detention?.toString() || "");
        setLayover((orderData as any).layover?.toString() || "");
        setExtraStop((orderData as any).extra_stop?.toString() || "");
        setLumper((orderData as any).lumper?.toString() || "");
        setLateFee((orderData as any).late_fee?.toString() || "");
        setDriverPrice(orderData.driver_price?.toString() || "");
        setTonu((orderData as any).tonu?.toString() || "");
        setDetentionDriver(
          (orderData as any).detention_driver > 0 ? (orderData as any).detention_driver.toString() : "",
        );
        setLayoverDriver((orderData as any).layover_driver > 0 ? (orderData as any).layover_driver.toString() : "");
        setLateFeeDriver((orderData as any).late_fee_driver > 0 ? (orderData as any).late_fee_driver.toString() : "");
        setTonuDriver((orderData as any).tonu_driver > 0 ? (orderData as any).tonu_driver.toString() : "");
        setNoTrackingFee((orderData as any).no_tracking_fee > 0 ? (orderData as any).no_tracking_fee.toString() : "");
        setNoTrackingFeeDriver(
          (orderData as any).no_tracking_fee_driver > 0 ? (orderData as any).no_tracking_fee_driver.toString() : "",
        );
        setWrongAddressFee(
          (orderData as any).wrong_address_fee > 0 ? (orderData as any).wrong_address_fee.toString() : "",
        );
        setWrongAddressFeeDriver(
          (orderData as any).wrong_address_fee_driver > 0 ? (orderData as any).wrong_address_fee_driver.toString() : "",
        );
        // Load multi-entry items, with backward-compat fallback to legacy single-value fields
        {
          const itemsRaw = (orderData as any).other_charges_items;
          if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
            setOtherChargesItems(
              itemsRaw.map((it: any) => ({
                amount: Number(it?.amount) || 0,
                driverAmount: Number(it?.driverAmount ?? it?.driver_amount) || 0,
                reason: String(it?.reason || ""),
              })),
            );
          } else {
            const legacyAmount = Number((orderData as any).other_charges) || 0;
            const legacyDriver = Number((orderData as any).other_charges_driver) || 0;
            const legacyReason = String((orderData as any).other_charges_reason || "");
            if (legacyAmount > 0 || legacyDriver > 0 || legacyReason) {
              setOtherChargesItems([
                { amount: legacyAmount, driverAmount: legacyDriver, reason: legacyReason },
              ]);
            } else {
              setOtherChargesItems([]);
            }
          }
        }
        {
          const itemsRaw = (orderData as any).other_additionals_items;
          if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
            setOtherAdditionalsItems(
              itemsRaw.map((it: any) => ({
                amount: Number(it?.amount) || 0,
                driverAmount: Number(it?.driverAmount ?? it?.driver_amount) || 0,
                reason: String(it?.reason || ""),
              })),
            );
          } else {
            const legacyAmount = Number((orderData as any).other_additionals) || 0;
            const legacyDriver = Number((orderData as any).other_additionals_driver) || 0;
            const legacyReason = String((orderData as any).other_additionals_reason || "");
            if (legacyAmount > 0 || legacyDriver > 0 || legacyReason) {
              setOtherAdditionalsItems([
                { amount: legacyAmount, driverAmount: legacyDriver, reason: legacyReason },
              ]);
            } else {
              setOtherAdditionalsItems([]);
            }
          }
        }
        setAdditionalMiles(
          (orderData as any).additional_miles > 0 ? (orderData as any).additional_miles.toString() : "",
        );
        setCommodity((orderData as any).commodity || "");
        setWeight((orderData as any).weight?.toString() || "");
        setReferenceNumber((orderData as any).reference_number || "");
        setPoNumber((orderData as any).po_number || "");
        setPuNumber((orderData as any).pu_number || "");
        setNotes(orderData.notes || "");
        // Parse notes into user and system sections
        const parsedNotes = parseNotes(orderData.notes || "");
        setUserNotes(parsedNotes.userNotes);
        setSystemNotes(parsedNotes.systemNotes);
        setBookedBy(orderData.booked_by || "");
        setEscortFee((orderData as any).escort_fee?.toString() || "");
        setEscortFeeBrokerPaid((orderData as any).escort_fee_broker_paid || false);
        setInternalLoadNumber(orderData.internal_load_number?.toString() || "");

        // Load partial load data
        setIsPartial((orderData as any).is_partial || false);
        if ((orderData as any).is_partial) {
          // Parse JSON strings to arrays
          const parseBrokersArray = (data: any) => {
            if (!data) return [];
            if (typeof data === "string") {
              try {
                return JSON.parse(data);
              } catch {
                return [];
              }
            }
            return Array.isArray(data) ? data : [];
          };

          setPartialBrokers(parseBrokersArray((orderData as any).partial_brokers));
          setPartialBrokerLoadNumbers(parseBrokersArray((orderData as any).partial_broker_loads));
          setPartialBookedByCompanies(parseBrokersArray((orderData as any).partial_booked_by_companies));
        }

        // Check if any additional fields have values > 0 to auto-show them
        const hasAdditionalValues =
          ((orderData as any).detention && parseFloat((orderData as any).detention) > 0) ||
          ((orderData as any).detention_driver && parseFloat((orderData as any).detention_driver) > 0) ||
          ((orderData as any).layover && parseFloat((orderData as any).layover) > 0) ||
          ((orderData as any).layover_driver && parseFloat((orderData as any).layover_driver) > 0) ||
          ((orderData as any).extra_stop && parseFloat((orderData as any).extra_stop) > 0) ||
          ((orderData as any).lumper && parseFloat((orderData as any).lumper) > 0) ||
          ((orderData as any).late_fee && parseFloat((orderData as any).late_fee) > 0) ||
          ((orderData as any).late_fee_driver && parseFloat((orderData as any).late_fee_driver) > 0) ||
          ((orderData as any).no_tracking_fee && parseFloat((orderData as any).no_tracking_fee) > 0) ||
          ((orderData as any).no_tracking_fee_driver && parseFloat((orderData as any).no_tracking_fee_driver) > 0) ||
          ((orderData as any).wrong_address_fee && parseFloat((orderData as any).wrong_address_fee) > 0) ||
          ((orderData as any).wrong_address_fee_driver &&
            parseFloat((orderData as any).wrong_address_fee_driver) > 0) ||
          ((orderData as any).tonu && parseFloat((orderData as any).tonu) > 0) ||
          ((orderData as any).tonu_driver && parseFloat((orderData as any).tonu_driver) > 0) ||
          ((orderData as any).other_charges && parseFloat((orderData as any).other_charges) > 0) ||
          ((orderData as any).other_charges_driver && parseFloat((orderData as any).other_charges_driver) > 0) ||
          ((orderData as any).other_additionals && parseFloat((orderData as any).other_additionals) > 0) ||
          ((orderData as any).other_additionals_driver &&
            parseFloat((orderData as any).other_additionals_driver) > 0) ||
          ((orderData as any).additional_miles && parseInt((orderData as any).additional_miles) > 0) ||
          ((orderData as any).escort_fee && parseFloat((orderData as any).escort_fee) > 0);
        setShowAdditionalFields(hasAdditionalValues);

        // Load recovery state
        setIsRecovery((orderData as any).is_recovery || false);
        if ((orderData as any).is_recovery) {
          // Get original driver and truck info from database
          const { data: origDriver } = await supabase
            .from("drivers")
            .select("name")
            .eq("id", (orderData as any).original_driver1_id)
            .maybeSingle();
          const { data: origTruck } = await supabase
            .from("trucks")
            .select("truck_number")
            .eq("id", (orderData as any).original_truck_id)
            .maybeSingle();
          const { data: origTrailer } = await supabase
            .from("trailers")
            .select("trailer_number")
            .eq("id", (orderData as any).original_trailer_id)
            .maybeSingle();

          // Get recovery history to check if trailers were swapped
          const { data: recoveryHistoryRows } = await supabase
            .from("recovery_history")
            .select("trailers_swapped")
            .eq("order_id", id)
            .is("reverted_at", null)
            .order("created_at", { ascending: false })
            .limit(1);

          const recoveryHistory = recoveryHistoryRows?.[0] ?? null;

          setOriginalDriverName(origDriver?.name || "");
          setOriginalTruckNumber(origTruck?.truck_number || "");
          setOriginalTrailerNumber(origTrailer?.trailer_number || "");
          setOriginalMiles((orderData as any).original_miles?.toString() || "");
          setOriginalDriverPrice((orderData as any).original_driver_price?.toString() || "");
          setRecoveryMiles((orderData as any).recovery_miles?.toString() || "");
          setRecoveryDriverPrice((orderData as any).recovery_driver_price?.toString() || "");
          setRecoveryDate((orderData as any).recovery_date || "");
          setTrailersSwapped(recoveryHistory?.trailers_swapped || false);
        }

        // Load order transfers from database
        const { data: transfersData } = await supabase
          .from("order_transfers")
          .select(
            `
            *,
            driver1:drivers!order_transfers_driver1_id_fkey(id, name),
            truck:trucks!order_transfers_truck_id_fkey(id, truck_number),
            trailer:trailers!order_transfers_trailer_id_fkey(id, trailer_number)
          `,
          )
          .eq("order_id", id)
          .order("sequence_number", { ascending: true });

        if (transfersData && transfersData.length > 0) {
          setOrderTransfers(transfersData);
        }

        // Load date change notes and original delivery date for tracking changes
        setDateChangeNotes((orderData as any).date_change_notes || "");
        if (orderData.delivery_datetime) {
          // Parse without timezone conversion to match how we handle dates in the form
          const parsed = parseSimpleDateTime(orderData.delivery_datetime);
          const dateObj = new Date(parsed.year, parsed.month - 1, parsed.day);
          setOriginalDeliveryDate(dateObj);
        }

        // Calculate miles from loaded_miles and dh_miles or use legacy mileage
        const loadedMilesValue = (orderData as any).loaded_miles || 0;
        const dhMilesValue = (orderData as any).dh_miles || 0;
        const totalMiles = loadedMilesValue + dhMilesValue || orderData.mileage || 0;
        setLoadedMiles(loadedMilesValue.toString());
        setDhMiles(dhMilesValue.toString());
        setBaselineLoadedMiles(loadedMilesValue);
        setBaselineDhMiles(dhMilesValue);

        // Load pickup/drops
        if (orderData.pickup_drops) {
          console.log("Processing pickup_drops:", orderData.pickup_drops);
          const transformedPickupsDrops = orderData.pickup_drops.map((pd: any) => {
            // Create date range from datetime field - each stop uses its own datetime
            let dateRange: DateRange | undefined = undefined;
            let startTime = "";
            let endTime = "";
            if (pd.datetime) {
              // Parse without timezone conversion
              const parsed = parseSimpleDateTime(pd.datetime);
              startTime = parsed.timeString;
              // Create date object from parsed components (no timezone conversion)
              const dateObj = new Date(parsed.year, parsed.month - 1, parsed.day);
              dateRange = {
                from: dateObj,
                to: dateObj,
              };
            }

            // Load end time from end_datetime if available
            if (pd.end_datetime) {
              const parsedEnd = parseSimpleDateTime(pd.end_datetime);
              endTime = parsedEnd.timeString;
            } else if (pd.datetime) {
              // Fallback to start time if no end_datetime
              endTime = startTime;
            }
            console.log(`Loading ${pd.type}:`, {
              startTime,
              endTime,
              dateRange,
              raw_datetime: pd.datetime,
              pickup_end_datetime: orderData.pickup_end_datetime,
              delivery_end_datetime: orderData.delivery_end_datetime,
            });
            return {
              id: pd.id,
              type: pd.type,
              address: pd.address || "",
              datetime: pd.datetime || "",
              dateRange,
              startTime,
              endTime,
              city: pd.city || "",
              state: pd.state || "",
              zipCode: pd.zip_code || "",
              contactName: pd.contact_name || "",
              contactPhone: pd.contact_phone || "",
              specialInstructions: pd.special_instructions || "",
              companyName: pd.company_name || "",
              latitude: pd.latitude || undefined,
              longitude: pd.longitude || undefined,
            };
          });

          // Deduplicate exact matches when loading
          const uniquePickupsDrops = transformedPickupsDrops.filter((item: any, index: number, self: any[]) => {
            return (
              index ===
              self.findIndex(
                (t: any) =>
                  t.type === item.type &&
                  t.address === item.address &&
                  t.city === item.city &&
                  t.state === item.state &&
                  t.zipCode === item.zipCode &&
                  t.datetime === item.datetime,
              )
            );
          });
          setPickupsDrops(uniquePickupsDrops);
          console.log("Set pickupsDrops to:", uniquePickupsDrops);
        }

        // Load existing files
        if (orderData.order_files) {
          setExistingFiles(orderData.order_files);
        }

        // Capture original snapshot for change tracking
        const firstPickupDrop = orderData.pickup_drops?.find((pd: any) => pd.type === "pickup");
        const firstDeliveryDrop = orderData.pickup_drops?.find((pd: any) => pd.type === "delivery");
        setOriginalSnapshot({
          freightAmount: orderData.freight_amount,
          driverPrice: orderData.driver_price,
          detention: (orderData as any).detention,
          detentionDriver: (orderData as any).detention_driver,
          layover: (orderData as any).layover,
          layoverDriver: (orderData as any).layover_driver,
          extraStop: (orderData as any).extra_stop,
          lateFee: (orderData as any).late_fee,
          lateFeeDriver: (orderData as any).late_fee_driver,
          tonu: (orderData as any).tonu,
          tonuDriver: (orderData as any).tonu_driver,
          lumper: (orderData as any).lumper,
          otherCharges: (orderData as any).other_charges,
          otherChargesDriver: (orderData as any).other_charges_driver,
          noTrackingFee: (orderData as any).no_tracking_fee,
          noTrackingFeeDriver: (orderData as any).no_tracking_fee_driver,
          wrongAddressFee: (orderData as any).wrong_address_fee,
          wrongAddressFeeDriver: (orderData as any).wrong_address_fee_driver,
          escortFee: (orderData as any).escort_fee,
          loadedMiles: (orderData as any).loaded_miles,
          dhMiles: (orderData as any).dh_miles,
          brokerLoadNumber: orderData.broker_load_number,
          truckId: orderData.truck_id,
          driver1Id: orderData.driver1_id,
          driver2Id: orderData.driver2_id,
          trailerId: orderData.trailer_id,
          brokerId: orderData.broker_id,
          bookedByCompanyId: orderData.booked_by_company_id,
          commodity: (orderData as any).commodity,
          weight: (orderData as any).weight,
          referenceNumber: (orderData as any).reference_number,
          poNumber: (orderData as any).po_number,
          puNumber: (orderData as any).pu_number,
          pickupAddress: firstPickupDrop?.address,
          pickupCity: firstPickupDrop?.city,
          pickupState: firstPickupDrop?.state,
          deliveryAddress: firstDeliveryDrop?.address,
          deliveryCity: firstDeliveryDrop?.city,
          deliveryState: firstDeliveryDrop?.state,
          pickupDatetime: orderData.pickup_datetime,
          deliveryDatetime: orderData.delivery_datetime,
        });

        console.log("Data loading completed successfully");
      }
    } catch (error) {
      console.error("Error loading order:", error);
      toast({
        title: "Error",
        description: "Failed to load order data",
        variant: "destructive",
      });
      const shouldReturnToReports = localStorage.getItem("returnToReports") === "true";
      const shouldReturnToYardLoads = localStorage.getItem("returnToYardLoads") === "true";
      const shouldReturnToTrips = localStorage.getItem("returnToTrips") === "true";
      const shouldReturnToOrders = localStorage.getItem("returnToOrders") === "true";
      if (shouldReturnToReports) {
        localStorage.removeItem("returnToReports");
        navigate("/reports");
      } else if (shouldReturnToYardLoads) {
        localStorage.removeItem("returnToYardLoads");
        navigate("/yard-loads");
      } else if (shouldReturnToTrips) {
        localStorage.removeItem("returnToTrips");
        navigate("/trips");
      } else if (shouldReturnToOrders) {
        navigate("/orders");
      } else {
        navigate("/orders");
      }
    } finally {
      console.log("Setting loading to false");
      setIsLoading(false);
    }
  }, [id, navigate, toast]);

  // Real-time subscription for order updates
  useEffect(() => {
    if (!id || id === ":id") return;
    console.log("Setting up real-time subscription for order:", id);
    const channel = supabase
      .channel(`order-${id}-changes`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log("Order changed:", payload);
          loadOrderData();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pickup_drops",
          filter: `order_id=eq.${id}`,
        },
        (payload) => {
          console.log("Pickup/drop changed:", payload);
          loadOrderData();
        },
      )
      .subscribe();
    return () => {
      console.log("Cleaning up real-time subscription for order:", id);
      supabase.removeChannel(channel);
    };
  }, [id, loadOrderData]);

  // Load order data on mount
  useEffect(() => {
    console.log("EditOrder useEffect - id parameter:", id);
    console.log("Current window location:", window.location.href);
    if (id && id !== ":id") {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        console.error("Invalid load ID format:", id);
        toast({
          title: "Error",
          description: "Invalid load ID format",
          variant: "destructive",
        });
        const shouldReturnToReports = localStorage.getItem("returnToReports") === "true";
        const shouldReturnToYardLoads = localStorage.getItem("returnToYardLoads") === "true";
        const shouldReturnToTrips = localStorage.getItem("returnToTrips") === "true";
        const shouldReturnToOrders = localStorage.getItem("returnToOrders") === "true";
        if (shouldReturnToReports) {
          localStorage.removeItem("returnToReports");
          navigate("/reports");
        } else if (shouldReturnToYardLoads) {
          localStorage.removeItem("returnToYardLoads");
          navigate("/yard-loads");
        } else if (shouldReturnToTrips) {
          localStorage.removeItem("returnToTrips");
          navigate("/trips");
        } else if (shouldReturnToOrders) {
          navigate("/orders");
        } else {
          navigate("/orders");
        }
        return;
      }
      loadOrderData();
    } else {
      console.error("No valid load ID provided. Received:", id);
      toast({
        title: "Error",
        description: "No valid load ID provided in URL",
        variant: "destructive",
      });
      const shouldReturnToReports = localStorage.getItem("returnToReports") === "true";
      const shouldReturnToYardLoads = localStorage.getItem("returnToYardLoads") === "true";
      const shouldReturnToTrips = localStorage.getItem("returnToTrips") === "true";
      const shouldReturnToOrders = localStorage.getItem("returnToOrders") === "true";
      if (shouldReturnToReports) {
        localStorage.removeItem("returnToReports");
        navigate("/reports");
      } else if (shouldReturnToYardLoads) {
        localStorage.removeItem("returnToYardLoads");
        navigate("/yard-loads");
      } else if (shouldReturnToTrips) {
        localStorage.removeItem("returnToTrips");
        navigate("/trips");
      } else if (shouldReturnToOrders) {
        navigate("/orders");
      } else {
        navigate("/orders");
      }
    }
  }, [id, loadOrderData, navigate, toast]);

  // Auto-calculate original driver rate in yard dialog based on cents_per_mile
  useEffect(() => {
    if (!yardDialogOpen || !driver1 || !yardOriginalMiles) return;

    const originalDriver = drivers?.find((d) => d.id === driver1);
    if (!originalDriver?.is_company_driver || !originalDriver?.cents_per_mile) return;

    const miles = parseFloat(yardOriginalMiles) || 0;
    if (miles <= 0) return;

    const calculatedPrice = miles * (originalDriver.cents_per_mile / 100);
    setOriginalDriverPrice(calculatedPrice.toFixed(2));
  }, [yardDialogOpen, driver1, yardOriginalMiles, drivers]);

  const addPickupDrop = (type: "pickup" | "delivery") => {
    const newItem: PickupDrop = {
      id: Date.now().toString(),
      type,
      address: "",
      datetime: "",
    };
    if (type === "pickup") {
      const lastPickupIndex = pickupsDrops.reduce((lastIndex, item, index) => {
        return item.type === "pickup" ? index : lastIndex;
      }, -1);
      const insertIndex = lastPickupIndex + 1;
      const newPickupsDrops = [...pickupsDrops];
      newPickupsDrops.splice(insertIndex, 0, newItem);
      setPickupsDrops(newPickupsDrops);
    } else {
      setPickupsDrops([...pickupsDrops, newItem]);
    }
  };
  const removePickupDrop = (id: string) => {
    setPickupsDrops(pickupsDrops.filter((item) => item.id !== id));
  };
  const updatePickupDrop = (id: string, field: keyof PickupDrop, value: any) => {
    setPickupsDrops(
      pickupsDrops.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  };
  const updatePickupDropTime = (id: string, timeType: "startTime" | "endTime", time: string) => {
    setPickupsDrops(
      pickupsDrops.map((item) =>
        item.id === id
          ? {
              ...item,
              [timeType]: time,
            }
          : item,
      ),
    );
  };
  const updatePickupDropDateRange = (id: string, dateRange: DateRange | undefined) => {
    setPickupsDrops(
      pickupsDrops.map((item) =>
        item.id === id
          ? {
              ...item,
              dateRange,
            }
          : item,
      ),
    );
  };

  // Build email subject line (same as NewOrder)
  const buildEmailSubject = (): string => {
    const selectedTruck = trucks?.find((t) => t.id === truck);
    const selectedDriver = drivers?.find((d) => d.id === driver1);
    const pickups = pickupsDrops.filter((p) => p.type === "pickup");
    const deliveries = pickupsDrops.filter((p) => p.type === "delivery");
    const truckNumber = selectedTruck?.truck_number || "TBD";
    const driverFirstName = selectedDriver?.name?.split(" ")[0] || "Driver";
    const pickupDate = pickups[0]?.dateRange?.from
      ? `${String(pickups[0].dateRange.from.getMonth() + 1).padStart(2, "0")}/${String(pickups[0].dateRange.from.getDate()).padStart(2, "0")}/${pickups[0].dateRange.from.getFullYear()}`
      : "TBD";
    const brokerLoad = brokerLoadNumber || "TBD";
    const firstPickupState = pickups[0]?.state || "TBD";
    const lastDeliveryState = deliveries[deliveries.length - 1]?.state || "TBD";
    return `#${truckNumber} ${driverFirstName} // ${pickupDate} // Load#${brokerLoad} // ${firstPickupState} - ${lastDeliveryState}`;
  };

  // Send email to driver with uploaded file (same as NewOrder)
  const handleSendEmailToDriver = async () => {
    if (emailFiles.length === 0) {
      toast({
        title: "No File Attached",
        description: "Please upload a file to send to the driver.",
        variant: "destructive",
      });
      return;
    }
    if (emailSent) return;
    try {
      setIsSendingEmail(true);
      const selectedDriver = drivers?.find((d) => d.id === driver1);
      if (!selectedDriver?.email) {
        throw new Error("Driver email not found. Please ensure the driver has an email address.");
      }
      const driver2ForEmail = driver2 ? drivers?.find((d) => d.id === driver2) : null;
      // Get company name from driver's company (not truck's company)
      let companyName = selectedDriver?.company?.name;

      // If company name is not in the driver object, fetch it from companies table
      if (!companyName && selectedDriver?.company_id) {
        console.log("📧 Company not in driver object, fetching from companies table...");
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("name")
          .eq("id", selectedDriver.company_id)
          .maybeSingle();

        if (companyError) {
          console.error("❌ Error fetching company:", companyError);
        } else if (companyData) {
          companyName = companyData.name;
          console.log("✅ Company fetched:", companyName);
        }
      }

      if (!companyName) {
        throw new Error("Driver company not found. Cannot determine sender email.");
      }
      const emailConfig = COMPANY_EMAIL_CONFIG[companyName];
      if (!emailConfig) {
        throw new Error(`Email configuration not found for company: ${companyName}. Please contact support.`);
      }
      const subject = buildEmailSubject();
      const emailFile = emailFiles[0];
      const reader = new FileReader();
      reader.readAsDataURL(emailFile);
      await new Promise((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64data = reader.result as string;
            const base64Content = base64data.split(",")[1];
            const {
              data: { session },
            } = await supabase.auth.getSession();
            const response = await fetch(
              "https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-load-confirmation-email",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}`,
                },
                body: JSON.stringify({
                  to: driver2ForEmail?.email ? [selectedDriver.email, driver2ForEmail.email] : selectedDriver.email,
                  from: emailConfig.sender,
                  cc: emailConfig.cc,
                  subject: subject,
                  bodyText: "Please see the load sheet attached below.",
                  attachmentBase64: base64Content,
                  attachmentFilename: emailFiles[0].name,
                  attachmentContentType: emailFiles[0].type,
                }),
              },
            );
            const responseData = await response.json();
            if (!response.ok) {
              throw new Error(responseData.error || "Failed to send email");
            }

            // Log the email to driver_email_log table
            if (id && selectedDriver.id) {
              console.log("📝 Logging email to driver_email_log:", {
                order_id: id,
                driver_id: selectedDriver.id,
                sent_by: session?.user?.id,
              });

              const { error: logError } = await supabase.from("driver_email_log").insert({
                order_id: id,
                driver_id: selectedDriver.id,
                email_type: "load_confirmation",
                sent_by: session?.user?.id,
              });

              if (logError) {
                console.error("❌ Error logging email:", logError);
              } else {
                console.log("✅ Email logged successfully");
              }
            } else {
              console.warn("⚠️ Cannot log email - missing order ID or driver ID:", {
                orderId: id,
                driverId: selectedDriver.id,
              });
            }

            setEmailSent(true);
            toast({
              title: "Email Sent",
              description: `File sent to ${selectedDriver.email}${driver2ForEmail?.email ? ` and ${driver2ForEmail.email}` : ""}`,
            });
            resolve(true);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
      });
    } catch (error: any) {
      toast({
        title: "Email Failed",
        description: error.message || "Failed to send email to driver",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };
  const togglePickupDropType = (id: string) => {
    setPickupsDrops(
      pickupsDrops.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            type: item.type === "pickup" ? "delivery" : "pickup",
          };
        }
        return item;
      }),
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(pickupsDrops);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setPickupsDrops(items);
  };
  const handleGenerateConfirmation = async () => {
    if (!bookedByCompany || !truck || !driver1 || pickupsDrops.length < 2) {
      toast({
        title: "Missing Information",
        description:
          "Please fill in company, truck, driver, pickup and delivery information before generating confirmation.",
        variant: "destructive",
      });
      return;
    }
    setIsGeneratingConfirmation(true);
    try {
      const selectedTruck = trucks?.find((t) => t.id === truck);
      const selectedDriver = drivers?.find((d) => d.id === driver1);

      // Get all pickups and deliveries
      const pickups = pickupsDrops.filter((p) => p.type === "pickup");
      const deliveries = pickupsDrops.filter((p) => p.type === "delivery");
      if (!selectedTruck || !selectedDriver || pickups.length === 0 || deliveries.length === 0) {
        throw new Error("Missing required data");
      }

      // Format dates and times
      const formatDate = (dateRange?: DateRange) => {
        if (!dateRange?.from) return "";
        const date = dateRange.from;
        return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
      };
      const formatTime = (time?: string) => time || "";

      // Helper to format location data
      const formatLocationData = (
        location: any,
        driverDateRange?: DateRange,
        driverStartTime?: string,
        driverEndTime?: string,
      ) => ({
        address: location.address,
        cityStateZip:
          `${location.city || ""}${location.city && location.state ? ", " : ""}${location.state || ""}${(location.city || location.state) && location.zipCode ? " " : ""}${location.zipCode || ""}`.trim(),
        date: formatDate(driverDateRange || location.dateRange),
        time:
          formatTime(driverStartTime || location.startTime) +
          (driverEndTime || location.endTime ? ` - ${formatTime(driverEndTime || location.endTime)}` : ""),
      });

      // Build confirmation data with all pickups and deliveries
      const confirmationData: any = {
        brokerLoadNumber: brokerLoadNumber || "TBD",
        driverName: driver2 ? "TEAM" : selectedDriver.name,
        truckNumber: selectedTruck.truck_number,
        trailerNumber: trailer || "",
        phoneNumber: selectedDriver.phone || "",
        commodity: "",
        weight: "",
        miles: loadedMiles || "",
        rate: driverPrice || "",
        // First pickup (always present)
        pickupShipper: pickups[0].companyName || "",
        pickupAddress: pickups[0].address,
        pickupCityStateZip: formatLocationData(
          pickups[0],
          driverPickupDateRange,
          driverPickupStartTime,
          driverPickupEndTime,
        ).cityStateZip,
        pickupDate: formatLocationData(pickups[0], driverPickupDateRange, driverPickupStartTime, driverPickupEndTime)
          .date,
        pickupTime: formatLocationData(pickups[0], driverPickupDateRange, driverPickupStartTime, driverPickupEndTime)
          .time,
        pickupPuNumber: "",
        pickupPoNumber: "",
      };

      // Add second pickup if exists
      if (pickups.length >= 2) {
        const pickup2Data = formatLocationData(pickups[1]);
        confirmationData.pickup2Shipper = pickups[1].companyName || "";
        confirmationData.pickup2Address = pickups[1].address;
        confirmationData.pickup2CityStateZip = pickup2Data.cityStateZip;
        confirmationData.pickup2Date = pickup2Data.date;
        confirmationData.pickup2Time = pickup2Data.time;
        confirmationData.pickup2PoNumber = "";
      }

      // Add third pickup if exists
      if (pickups.length >= 3) {
        const pickup3Data = formatLocationData(pickups[2]);
        confirmationData.pickup3Shipper = pickups[2].companyName || "";
        confirmationData.pickup3Address = pickups[2].address;
        confirmationData.pickup3CityStateZip = pickup3Data.cityStateZip;
        confirmationData.pickup3Date = pickup3Data.date;
        confirmationData.pickup3Time = pickup3Data.time;
        confirmationData.pickup3PoNumber = "";
      }

      // Add first delivery (always present)
      const delivery1Data = formatLocationData(
        deliveries[0],
        driverDeliveryDateRange,
        driverDeliveryStartTime,
        driverDeliveryEndTime,
      );
      confirmationData.deliveryReceiver = deliveries[0].companyName || "";
      confirmationData.deliveryAddress = deliveries[0].address;
      confirmationData.deliveryCityStateZip = delivery1Data.cityStateZip;
      confirmationData.deliveryDate = delivery1Data.date;
      confirmationData.deliveryTime = delivery1Data.time;
      confirmationData.deliveryPoNumber = "";

      // Add second delivery if exists
      if (deliveries.length >= 2) {
        const delivery2Data = formatLocationData(deliveries[1]);
        confirmationData.delivery2Receiver = deliveries[1].companyName || "";
        confirmationData.delivery2Address = deliveries[1].address;
        confirmationData.delivery2CityStateZip = delivery2Data.cityStateZip;
        confirmationData.delivery2Date = delivery2Data.date;
        confirmationData.delivery2Time = delivery2Data.time;
        confirmationData.delivery2PoNumber = "";
      }

      // Add third delivery if exists
      if (deliveries.length >= 3) {
        const delivery3Data = formatLocationData(deliveries[2]);
        confirmationData.delivery3Receiver = deliveries[2].companyName || "";
        confirmationData.delivery3Address = deliveries[2].address;
        confirmationData.delivery3CityStateZip = delivery3Data.cityStateZip;
        confirmationData.delivery3Date = delivery3Data.date;
        confirmationData.delivery3Time = delivery3Data.time;
        confirmationData.delivery3PoNumber = "";
      }

      // Add fourth delivery if exists
      if (deliveries.length >= 4) {
        const delivery4Data = formatLocationData(deliveries[3]);
        confirmationData.delivery4Receiver = deliveries[3].companyName || "";
        confirmationData.delivery4Address = deliveries[3].address;
        confirmationData.delivery4CityStateZip = delivery4Data.cityStateZip;
        confirmationData.delivery4Date = delivery4Data.date;
        confirmationData.delivery4Time = delivery4Data.time;
        confirmationData.delivery4PoNumber = "";
      }

      // Add fifth delivery if exists
      if (deliveries.length >= 5) {
        const delivery5Data = formatLocationData(deliveries[4]);
        confirmationData.delivery5Receiver = deliveries[4].companyName || "";
        confirmationData.delivery5Address = deliveries[4].address;
        confirmationData.delivery5CityStateZip = delivery5Data.cityStateZip;
        confirmationData.delivery5Date = delivery5Data.date;
        confirmationData.delivery5Time = delivery5Data.time;
        confirmationData.delivery5PoNumber = "";
      }

      // Template type will be auto-detected by edge function based on number of pickups/deliveries
      console.log(`📋 Generating confirmation with ${pickups.length} pickup(s) and ${deliveries.length} delivery(ies)`);

      // Generate PDF via edge function (using fetch for binary data)
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      const response = await fetch(`https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/generate-load-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(confirmationData),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to generate confirmation");
      }

      // Create a blob from the response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `load-confirmation-${confirmationData.brokerLoadNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Confirmation Generated",
        description: "Load confirmation PDF has been generated and downloaded.",
      });
    } catch (error: any) {
      console.error("Confirmation generation error:", error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate load confirmation",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingConfirmation(false);
    }
  };

  // File drag and drop handlers
  const createFileDragHandlers = (fileType: "rc" | "bol" | "pod" | "additional" | "email") => {
    const setFiles = {
      rc: setRcFiles,
      bol: setBolFiles,
      pod: setPodFiles,
      additional: setAdditionalFiles,
      email: setEmailFiles,
    }[fileType];
    const fileInputRef = {
      rc: rcFileInputRef,
      bol: bolFileInputRef,
      pod: podFileInputRef,
      additional: additionalFileInputRef,
      email: emailFileInputRef,
    }[fileType];
    return {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragStates((prev) => ({
          ...prev,
          [fileType]: true,
        }));
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only set drag state to false if we're leaving the drop zone entirely
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
          setDragStates((prev) => ({
            ...prev,
            [fileType]: false,
          }));
        }
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragStates((prev) => ({
          ...prev,
          [fileType]: false,
        }));
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          if (fileType === "email") {
            const selected = Array.from(files);
            const rcNewNames = new Set(rcFiles ? Array.from(rcFiles).map((f) => f.name) : []);
            const rcExistingNames = new Set(
              existingFiles.filter((f) => f.file_category === "RC").map((f) => f.file_name),
            );
            const filtered = selected.filter((f) => !rcNewNames.has(f.name) && !rcExistingNames.has(f.name));
            if (filtered.length < selected.length) {
              toast({
                title: "Duplicate file skipped",
                description: "Files already uploaded as RC cannot be used for email to driver.",
                variant: "destructive",
              });
            }
            (setFiles as React.Dispatch<React.SetStateAction<File[]>>)(filtered);
          } else {
            (setFiles as React.Dispatch<React.SetStateAction<FileList>>)(files);
          }
        }
      },
    };
  };

  // Click handler for file upload cards
  const handleCardClick = (fileType: "rc" | "bol" | "pod" | "additional") => (e: React.MouseEvent) => {
    console.log(`[DEBUG] Card clicked for ${fileType}`);

    // Don't trigger if clicking on view/delete buttons
    if ((e.target as HTMLElement).closest("button")) {
      console.log("[DEBUG] Clicked on a button, skipping file input");
      return;
    }
    const fileInputRef = {
      rc: rcFileInputRef,
      bol: bolFileInputRef,
      pod: podFileInputRef,
      additional: additionalFileInputRef,
    }[fileType];
    console.log("[DEBUG] File input ref:", fileInputRef.current);
    if (fileInputRef.current) {
      console.log("[DEBUG] Triggering file input click");
      fileInputRef.current.click();
    } else {
      console.error("[DEBUG] File input ref is null!");
    }
  };
  const rcDragHandlers = createFileDragHandlers("rc");
  const bolDragHandlers = createFileDragHandlers("bol");
  const podDragHandlers = createFileDragHandlers("pod");
  const additionalDragHandlers = createFileDragHandlers("additional");
  const emailDragHandlers = createFileDragHandlers("email");

  // Prepare options for dropdowns
  const companyOptions =
    companies?.map((company) => ({
      value: company.id,
      label: company.name,
    })) || [];
  const truckOptions =
    trucks?.map((truck) => ({
      value: truck.id,
      label: truck.truck_number,
    })) || [];
  const trailerOptions = [
    // Add deleted trailer option if exists
    ...(deletedTrailerNumber && !trailerId ? [{ value: "deleted", label: deletedTrailerNumber }] : []),
    ...(trailers?.map((trailer) => ({
      value: trailer.id,
      label: trailer.trailer_number,
    })) || []),
  ];
  const driverOptions =
    drivers?.map((driver) => ({
      value: driver.id,
      label: driver.name,
    })) || [];
  const handleRecoverySave = async (data: RecoveryData) => {
    try {
      // Check if original assignment was N/A (manual entry case)
      const isManualOriginal = data.manualOriginalDriver || data.manualOriginalTruck;

      // Get driver and truck names for the note
      const recoveryDriver = drivers?.find((d) => d.id === data.recoveryDriverId);
      const recoveryTruck = trucks?.find((t) => t.id === data.recoveryTruckId);

      // Build transfer note to add to order notes
      const transferDate = new Date(data.transferDatetime);
      const formattedDate = transferDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const transferNote = `[TRANSFER #1] ${formattedDate} - ${data.transferCity}, ${data.transferState}\nNew Driver: ${recoveryDriver?.name || "Unknown"} | Truck: ${recoveryTruck?.truck_number || "Unknown"}\nReason: ${data.description}`;

      // Get current order notes to append transfer note
      const { data: currentOrder, error: fetchError } = await supabase
        .from("orders")
        .select("notes")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      // Parse existing notes and append new transfer note to user notes section
      const { userNotes: existingUserNotes, systemNotes: existingSystemNotes } = parseNotes(currentOrder?.notes);
      const updatedUserNotes = existingUserNotes ? `${existingUserNotes}\n\n${transferNote}` : transferNote;
      const newNotes = combineNotes(updatedUserNotes, existingSystemNotes);

      const { error } = await supabase
        .from("orders")
        .update({
          is_recovery: true,
          original_driver1_id: driver1 || null,
          original_driver2_id: driver2 || null,
          original_truck_id: truck || null,
          original_trailer_id: trailerId || null,
          original_miles: data.originalMiles,
          original_driver_price: data.originalDriverRate,
          recovery_miles: data.recoveryMiles,
          recovery_driver_price: data.recoveryDriverRate,
          recovery_date: data.recoveryDate,
          // Update current assignment to transfer driver
          truck_id: data.recoveryTruckId,
          trailer_id: data.swapTrailers ? trailerId : data.recoveryTrailerId || null,
          driver1_id: data.recoveryDriverId,
          driver2_id: null,
          notes: newNotes,
        })
        .eq("id", id);
      if (error) throw error;

      // Insert recovery history record
      const { error: historyError } = await supabase.from("recovery_history").insert({
        order_id: id,
        original_driver1_id: driver1 || null,
        original_driver2_id: driver2 || null,
        original_truck_id: truck || null,
        original_trailer_id: trailerId || null,
        recovery_driver1_id: data.recoveryDriverId,
        recovery_driver2_id: null,
        recovery_truck_id: data.recoveryTruckId,
        recovery_trailer_id: data.recoveryTrailerId || null,
        recovery_date: data.recoveryDate,
        trailers_swapped: data.swapTrailers,
        original_dispatcher_id: profile?.user_id || null,
      });

      if (historyError) throw historyError;

      // Insert transfer records into order_transfers table for multi-transfer tracking
      const transferRecords = [
        // Original assignment (sequence 0)
        {
          order_id: id,
          sequence_number: 0,
          driver1_id: isManualOriginal ? null : driver1 || null,
          truck_id: isManualOriginal ? null : truck || null,
          trailer_id: isManualOriginal ? null : trailerId || null,
          miles: data.originalMiles,
          driver_price: data.originalDriverRate,
          transfer_date: data.recoveryDate,
          created_by: profile?.user_id || null,
          manual_driver_name: isManualOriginal ? data.manualOriginalDriver : null,
          manual_truck_number: isManualOriginal ? data.manualOriginalTruck : null,
          manual_trailer_number: isManualOriginal ? data.manualOriginalTrailer : null,
        },
        // First transfer (sequence 1)
        {
          order_id: id,
          sequence_number: 1,
          driver1_id: data.recoveryDriverId,
          truck_id: data.recoveryTruckId,
          trailer_id: data.swapTrailers ? trailerId : data.recoveryTrailerId || null,
          miles: data.recoveryMiles,
          driver_price: data.recoveryDriverRate,
          transfer_date: data.recoveryDate,
          transfer_city: data.transferCity,
          transfer_state: data.transferState,
          transfer_address: data.transferAddress || null,
          transfer_datetime: data.transferDatetime,
          created_by: profile?.user_id || null,
        },
      ];

      const { error: transferError } = await supabase.from("order_transfers").insert(transferRecords);

      if (transferError) {
        console.error("Error inserting transfer records:", transferError);
        // Don't throw - recovery history is more important, this is supplementary
      }

      // Handle trailer swap if requested (only if both trucks have trailers)
      if (data.swapTrailers && trailerId && data.recoveryTrailerId && truck) {
        // Step 1: Clear both trailers from ALL trucks that currently hold them
        // (the order's trailer may have moved to a third truck since the order was created)
        const [c1, c2, c3, c4] = await Promise.all([
          supabase.from("trucks").update({ trailer_id: null }).eq("id", truck),
          supabase.from("trucks").update({ trailer_id: null }).eq("id", data.recoveryTruckId),
          supabase.from("trucks").update({ trailer_id: null }).eq("trailer_id", trailerId),
          supabase.from("trucks").update({ trailer_id: null }).eq("trailer_id", data.recoveryTrailerId),
        ]);
        if (c1.error) throw c1.error;
        if (c2.error) throw c2.error;
        if (c3.error) throw c3.error;
        if (c4.error) throw c4.error;

        // Step 2: Assign swapped trailers
        const [r1, r2] = await Promise.all([
          supabase.from("trucks").update({ trailer_id: data.recoveryTrailerId }).eq("id", truck),
          supabase.from("trucks").update({ trailer_id: trailerId }).eq("id", data.recoveryTruckId),
        ]);
        if (r1.error) throw r1.error;
        if (r2.error) throw r2.error;

        // Hard refetch ensures UI shows final DB state regardless of realtime event ordering
        await queryClient.refetchQueries({ queryKey: ["trucks", "v2"] });
      }

      // Update display state with manual values if provided
      if (data.manualOriginalDriver) setOriginalDriverName(data.manualOriginalDriver);
      if (data.manualOriginalTruck) setOriginalTruckNumber(data.manualOriginalTruck);
      if (data.manualOriginalTrailer) setOriginalTrailerNumber(data.manualOriginalTrailer);

      toast({
        title: "Success",
        description: data.swapTrailers
          ? "Load transferred and trailers swapped successfully"
          : "Load marked as transfer successfully",
      });

      // Reload order data to reflect changes
      await loadOrderData();
    } catch (error: any) {
      console.error("Error saving transfer load:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to mark load as transfer",
        variant: "destructive",
      });
    }
  };

  // Handler for adding additional transfers
  const handleAddTransfer = async (data: AddTransferData) => {
    try {
      // Get the last transfer to use as "previous"
      const lastTransfer = orderTransfers[orderTransfers.length - 1];

      // Get driver name for the note
      const newDriver = drivers?.find((d) => d.id === data.newDriverId);
      const newTruck = trucks?.find((t) => t.id === data.newTruckId);

      // Insert new transfer record
      const { error } = await supabase.from("order_transfers").insert({
        order_id: id,
        sequence_number: data.sequenceNumber,
        driver1_id: data.newDriverId,
        truck_id: data.newTruckId,
        trailer_id: data.newTrailerId || null,
        miles: data.newMiles,
        driver_price: data.newDriverPrice,
        transfer_date: data.transferDate,
        transfer_city: data.transferCity,
        transfer_state: data.transferState,
        transfer_address: data.transferAddress || null,
        transfer_datetime: data.transferDatetime,
        created_by: profile?.user_id || null,
      });

      if (error) throw error;

      // Build transfer note to add to order notes
      const transferDate = new Date(data.transferDatetime);
      const formattedDate = transferDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const transferNote = `[TRANSFER #${data.sequenceNumber}] ${formattedDate} - ${data.transferCity}, ${data.transferState}\nNew Driver: ${newDriver?.name || "Unknown"} | Truck: ${newTruck?.truck_number || "Unknown"}\nReason: ${data.description}`;

      // Get current order notes to append transfer note
      const { data: currentOrder, error: fetchError } = await supabase
        .from("orders")
        .select("notes")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      // Parse existing notes and append new transfer note to user notes section
      const { userNotes, systemNotes } = parseNotes(currentOrder?.notes);
      const updatedUserNotes = userNotes ? `${userNotes}\n\n${transferNote}` : transferNote;
      const newNotes = combineNotes(updatedUserNotes, systemNotes);

      // Update the order's current driver/truck/trailer and notes
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          driver1_id: data.newDriverId,
          truck_id: data.newTruckId,
          trailer_id: data.newTrailerId || null,
          notes: newNotes,
        })
        .eq("id", id);

      if (orderError) throw orderError;

      toast({
        title: "Success",
        description: `Transfer #${data.sequenceNumber} added successfully`,
      });

      await loadOrderData();
      // Real-time subscription will update the cache
    } catch (error: any) {
      console.error("Error adding transfer:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add transfer",
        variant: "destructive",
      });
    }
  };

  // Handler for editing existing transfers
  const handleEditTransferSave = async (data: EditTransferData) => {
    try {
      // Check if this is a legacy transfer (stored in order fields, not order_transfers table)
      const isLegacyOriginal = data.id.startsWith("legacy-original-");
      const isLegacyTransfer1 = data.id.startsWith("legacy-transfer1-");

      if (isLegacyOriginal) {
        // Update legacy original driver fields on the order
        const updateData: any = {
          original_miles: data.miles || null,
          original_driver_price: data.driverPrice || null,
        };

        // If driver/truck/trailer IDs provided, update them and store names for lookup
        if (data.driverId) {
          updateData.original_driver1_id = data.driverId;
          // Store the driver name as well for deleted_driver1_name backup
          const driver = drivers?.find((d) => d.id === data.driverId);
          if (driver) {
            setOriginalDriverName(driver.name || "");
          }
        }
        if (data.truckId) {
          updateData.original_truck_id = data.truckId;
          const truckObj = trucks?.find((t) => t.id === data.truckId);
          if (truckObj) {
            setOriginalTruckNumber(truckObj.truck_number || "");
          }
        }
        if (data.trailerId) {
          updateData.original_trailer_id = data.trailerId;
          const trailerObj = trailers?.find((t) => t.id === data.trailerId);
          if (trailerObj) {
            setOriginalTrailerNumber(trailerObj.trailer_number || "");
          }
        }

        const { error } = await supabase.from("orders").update(updateData).eq("id", id);

        if (error) throw error;

        // Update local state
        if (data.miles !== undefined) setOriginalMiles(data.miles.toString());
        if (data.driverPrice !== undefined) setOriginalDriverPrice(data.driverPrice.toString());
      } else if (isLegacyTransfer1) {
        // Update legacy transfer #1 fields (these are the current driver/truck on the order)
        const updateData: any = {
          recovery_miles: data.miles || null,
          recovery_driver_price: data.driverPrice || null,
        };

        if (data.driverId) {
          updateData.driver1_id = data.driverId;
          setDriver1(data.driverId);
        }
        if (data.truckId) {
          updateData.truck_id = data.truckId;
          setTruck(data.truckId);
        }
        if (data.trailerId) {
          updateData.trailer_id = data.trailerId;
          setTrailerId(data.trailerId);
          const trailerObj = trailers?.find((t) => t.id === data.trailerId);
          if (trailerObj) {
            setTrailer(trailerObj.trailer_number || "");
          }
        }

        const { error } = await supabase.from("orders").update(updateData).eq("id", id);

        if (error) throw error;

        // Update local state
        if (data.miles !== undefined) setRecoveryMiles(data.miles.toString());
        if (data.driverPrice !== undefined) setRecoveryDriverPrice(data.driverPrice.toString());
      } else {
        // Normal order_transfers table update
        const updateData: any = {
          transfer_city: data.transferCity,
          transfer_state: data.transferState,
          transfer_address: data.transferAddress || null,
          transfer_datetime: data.transferDatetime,
        };

        // Only update these fields if they were changed
        if (data.truckId !== undefined) updateData.truck_id = data.truckId || null;
        if (data.trailerId !== undefined) updateData.trailer_id = data.trailerId || null;
        if (data.driverId !== undefined) updateData.driver1_id = data.driverId || null;
        if (data.miles !== undefined) updateData.miles = data.miles;
        if (data.driverPrice !== undefined) updateData.driver_price = data.driverPrice;

        const { error } = await supabase.from("order_transfers").update(updateData).eq("id", data.id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Transfer updated successfully",
      });

      await loadOrderData();
      // Real-time subscription will update the cache
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (error: any) {
      console.error("Error updating transfer:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update transfer",
        variant: "destructive",
      });
    }
  };

  const handleRevertTransfer = async () => {
    if (!id) return;

    try {
      // Get the recovery history for this order (normal transfer flow)
      const { data: recoveryHistoryRows, error: historyError } = await supabase
        .from("recovery_history")
        .select("*")
        .eq("order_id", id)
        .is("reverted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (historyError) throw historyError;

      const recoveryHistory = recoveryHistoryRows?.[0] ?? null;

      if (historyError) throw historyError;

      // Fallback: Yard-transfer (Left at the Yard) loads do NOT create a recovery_history row.
      if (!recoveryHistory) {
        const { data: orderRow, error: orderRowError } = await supabase
          .from("orders")
          .select(
            "is_recovery, truck_id, driver1_id, original_driver1_id, original_driver2_id, original_truck_id, original_trailer_id",
          )
          .eq("id", id)
          .maybeSingle();

        if (orderRowError) throw orderRowError;

        const isLeftAtYardTransfer =
          !!orderRow?.is_recovery &&
          !orderRow?.truck_id &&
          !orderRow?.driver1_id &&
          (orderRow?.original_driver1_id || orderRow?.original_truck_id || orderRow?.original_trailer_id);

        if (!isLeftAtYardTransfer) {
          toast({
            title: "No Transfer to Revert",
            description: "No active transfer history found for this load",
            variant: "destructive",
          });
          return;
        }

        const { error: yardRevertError } = await supabase
          .from("orders")
          .update({
            is_recovery: false,
            driver1_id: orderRow?.original_driver1_id || null,
            driver2_id: orderRow?.original_driver2_id || null,
            truck_id: orderRow?.original_truck_id || null,
            trailer_id: orderRow?.original_trailer_id || null,

            // Clear yard-transfer fields
            original_driver1_id: null,
            original_driver2_id: null,
            original_truck_id: null,
            original_trailer_id: null,
            original_miles: null,
            original_driver_price: null,
            recovery_miles: null,
            recovery_driver_price: null,
            recovery_date: null,
          })
          .eq("id", id);

        if (yardRevertError) throw yardRevertError;

        const { error: transfersDeleteError } = await supabase.from("order_transfers").delete().eq("order_id", id);

        if (transfersDeleteError) throw transfersDeleteError;

        toast({
          title: "Success",
          description: "Yard transfer reverted — original driver and truck restored",
        });

        await loadOrderData();
        return;
      }

      // Revert order back to original state - clear ALL transfer fields
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          is_recovery: false,
          truck_id: recoveryHistory.original_truck_id,
          trailer_id: recoveryHistory.original_trailer_id,
          driver1_id: recoveryHistory.original_driver1_id,
          driver2_id: recoveryHistory.original_driver2_id,
          // Clear all original_* fields
          original_driver1_id: null,
          original_driver2_id: null,
          original_truck_id: null,
          original_trailer_id: null,
          original_miles: null,
          original_driver_price: null,
          original_freight_amount: null,
          // Clear all recovery_* fields
          recovery_date: null,
          recovery_miles: null,
          recovery_driver_price: null,
          recovery_freight_amount: null,
        })
        .eq("id", id);

      if (orderError) throw orderError;

      // Delete order_transfers records for this order
      const { error: transfersDeleteError } = await supabase.from("order_transfers").delete().eq("order_id", id);

      if (transfersDeleteError) throw transfersDeleteError;

      // If trailers were swapped, swap them back using two-stage approach
      // to avoid trucks_trailer_id_unique constraint violation
      if (
        recoveryHistory.trailers_swapped &&
        recoveryHistory.original_trailer_id &&
        recoveryHistory.recovery_trailer_id
      ) {
        // Stage 1: Clear trailers from ALL trucks that currently hold them
        const [c1, c2, c3, c4] = await Promise.all([
          supabase.from("trucks").update({ trailer_id: null }).eq("id", recoveryHistory.original_truck_id),
          supabase.from("trucks").update({ trailer_id: null }).eq("id", recoveryHistory.recovery_truck_id),
          supabase.from("trucks").update({ trailer_id: null }).eq("trailer_id", recoveryHistory.original_trailer_id),
          supabase.from("trucks").update({ trailer_id: null }).eq("trailer_id", recoveryHistory.recovery_trailer_id),
        ]);
        if (c1.error || c2.error || c3.error || c4.error) throw c1.error || c2.error || c3.error || c4.error;

        // Stage 2: Assign correct trailers back
        const [r1, r2] = await Promise.all([
          supabase
            .from("trucks")
            .update({ trailer_id: recoveryHistory.original_trailer_id })
            .eq("id", recoveryHistory.original_truck_id),
          supabase
            .from("trucks")
            .update({ trailer_id: recoveryHistory.recovery_trailer_id })
            .eq("id", recoveryHistory.recovery_truck_id),
        ]);
        if (r1.error || r2.error) throw r1.error || r2.error;

        // Hard refetch ensures UI shows final DB state
        await queryClient.refetchQueries({ queryKey: ["trucks", "v2"] });
      }

      // Mark recovery as reverted
      const { error: revertError } = await supabase
        .from("recovery_history")
        .update({
          reverted_at: new Date().toISOString(),
          reverted_by: profile?.user_id || null,
        })
        .eq("id", recoveryHistory.id);

      if (revertError) throw revertError;

      toast({
        title: "Success",
        description: recoveryHistory.trailers_swapped
          ? "Transfer reverted and trailers swapped back successfully"
          : "Transfer reverted successfully",
      });

      // Reload order data
      await loadOrderData();
    } catch (error: any) {
      console.error("Error reverting transfer:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to revert transfer",
        variant: "destructive",
      });
    }
  };
  // Build current snapshot for change detection
  const buildCurrentSnapshot = useCallback((): OrderSnapshot => {
    const allPickups = pickupsDrops.filter((item) => item.type === "pickup");
    const allDeliveries = pickupsDrops.filter((item) => item.type === "delivery");
    const firstPickup = allPickups[0];
    const firstDelivery = allDeliveries[0];

    return {
      freightAmount: freightAmount ? parseFloat(freightAmount) : null,
      driverPrice: driverPrice ? parseFloat(driverPrice) : null,
      detention: detention ? parseFloat(detention) : null,
      detentionDriver: detentionDriver ? parseFloat(detentionDriver) : null,
      layover: layover ? parseFloat(layover) : null,
      layoverDriver: layoverDriver ? parseFloat(layoverDriver) : null,
      extraStop: extraStop ? parseFloat(extraStop) : null,
      lateFee: lateFee ? parseFloat(lateFee) : null,
      lateFeeDriver: lateFeeDriver ? parseFloat(lateFeeDriver) : null,
      tonu: tonu ? parseFloat(tonu) : null,
      tonuDriver: tonuDriver ? parseFloat(tonuDriver) : null,
      lumper: lumper ? parseFloat(lumper) : null,
      otherCharges: otherCharges ? parseFloat(otherCharges) : null,
      otherChargesDriver: otherChargesDriver ? parseFloat(otherChargesDriver) : null,
      noTrackingFee: noTrackingFee ? parseFloat(noTrackingFee) : null,
      noTrackingFeeDriver: noTrackingFeeDriver ? parseFloat(noTrackingFeeDriver) : null,
      wrongAddressFee: wrongAddressFee ? parseFloat(wrongAddressFee) : null,
      wrongAddressFeeDriver: wrongAddressFeeDriver ? parseFloat(wrongAddressFeeDriver) : null,
      escortFee: escortFee ? parseFloat(escortFee) : null,
      loadedMiles: loadedMiles ? parseInt(loadedMiles) : null,
      dhMiles: dhMiles ? parseInt(dhMiles) : null,
      brokerLoadNumber: brokerLoadNumber || null,
      truckId: truck || null,
      driver1Id: driver1 || null,
      driver2Id: driver2 || null,
      trailerId: trailerId || null,
      brokerId: broker || null,
      bookedByCompanyId: bookedByCompany || null,
      commodity: commodity || null,
      weight: weight ? parseFloat(weight) : null,
      referenceNumber: referenceNumber || null,
      poNumber: poNumber || null,
      puNumber: puNumber || null,
      pickupAddress: firstPickup?.address,
      pickupCity: firstPickup?.city,
      pickupState: firstPickup?.state,
      deliveryAddress: firstDelivery?.address,
      deliveryCity: firstDelivery?.city,
      deliveryState: firstDelivery?.state,
      pickupDatetime:
        firstPickup?.dateRange?.from && firstPickup?.startTime
          ? combineDateAndTime(firstPickup.dateRange.from, firstPickup.startTime)
          : null,
      deliveryDatetime:
        firstDelivery?.dateRange?.from && firstDelivery?.startTime
          ? combineDateAndTime(firstDelivery.dateRange.from, firstDelivery.startTime)
          : null,
    };
  }, [
    freightAmount,
    driverPrice,
    detention,
    detentionDriver,
    layover,
    layoverDriver,
    extraStop,
    lateFee,
    lateFeeDriver,
    tonu,
    tonuDriver,
    lumper,
    otherCharges,
    otherChargesDriver,
    noTrackingFee,
    noTrackingFeeDriver,
    wrongAddressFee,
    wrongAddressFeeDriver,
    escortFee,
    loadedMiles,
    dhMiles,
    brokerLoadNumber,
    truck,
    driver1,
    driver2,
    trailerId,
    broker,
    bookedByCompany,
    commodity,
    weight,
    referenceNumber,
    poNumber,
    puNumber,
    pickupsDrops,
  ]);

  // Check for changes and show dialog if needed
  const detectChanges = useCallback((): string[] => {
    if (!originalSnapshot) return [];

    const currentSnapshot = buildCurrentSnapshot();
    const lookupMaps = {
      trucks: new Map(trucks?.map((t) => [t.id, t.truck_number]) || []),
      drivers: new Map(drivers?.map((d) => [d.id, d.name || ""]) || []),
      trailers: new Map(trailers?.map((t) => [t.id, t.trailer_number]) || []),
      brokers: new Map(brokers?.map((b) => [b.id, b.name]) || []),
      companies: new Map(companies?.map((c) => [c.id, c.name]) || []),
    };

    return generateChangeMessages(
      originalSnapshot,
      currentSnapshot,
      lookupMaps,
      profile?.full_name || profile?.email || "Unknown",
    );
  }, [originalSnapshot, buildCurrentSnapshot, trucks, drivers, trailers, brokers, companies, profile]);

  // Navigate back to the referring page
  const navigateBack = useCallback(() => {
    const shouldReturnToYardLoads = localStorage.getItem("returnToYardLoads") === "true";

    if (returnToReports) {
      localStorage.removeItem("returnToReports");
      navigate("/reports");
    } else if (returnToTrips) {
      localStorage.removeItem("returnToTrips");
      navigate("/trips");
    } else if (returnToAnalytics) {
      localStorage.removeItem("returnToAnalytics");
      navigate("/analytics");
    } else if (shouldReturnToYardLoads) {
      localStorage.removeItem("returnToYardLoads");
      navigate("/yard-loads");
    } else {
      localStorage.removeItem("returnToOrders");
      navigate("/orders");
    }
    window.scrollTo(0, 0);
  }, [navigate, returnToReports, returnToTrips, returnToAnalytics]);

  // Actually perform the save with optional user note
  const performSave = async (changeNote?: string) => {
    try {
      // Update order - Calculate pickup/delivery datetimes from stops
      const allPickups = pickupsDrops.filter((item) => item.type === "pickup");
      const allDeliveries = pickupsDrops.filter((item) => item.type === "delivery");
      const firstPickup = allPickups[0];
      const lastPickup = allPickups[allPickups.length - 1];
      const firstDelivery = allDeliveries[0];
      const lastDelivery = allDeliveries[allDeliveries.length - 1];

      // Calculate new delivery datetime for comparison
      const newDeliveryDatetime =
        firstDelivery?.dateRange?.from && firstDelivery?.startTime
          ? combineDateAndTime(firstDelivery.dateRange.from, firstDelivery.startTime)
          : null;

      // Check if delivery date changed (date only, not time) and append to date change notes
      let updatedDateChangeNotes = dateChangeNotes;
      let dateWasChanged = false;
      if (originalDeliveryDate && newDeliveryDatetime) {
        const originalDateOnly = new Date(
          originalDeliveryDate.getFullYear(),
          originalDeliveryDate.getMonth(),
          originalDeliveryDate.getDate(),
        );

        // Parse the new datetime string WITHOUT timezone conversion (same as how we loaded originalDeliveryDate)
        const parsedNewDate = parseSimpleDateTime(newDeliveryDatetime);
        const newDateOnlyNormalized = new Date(parsedNewDate.year, parsedNewDate.month - 1, parsedNewDate.day);

        // Only add note if the dates are different (ignoring time)
        if (originalDateOnly.getTime() !== newDateOnlyNormalized.getTime()) {
          const oldDateStr = originalDeliveryDate.toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
          });
          const dateNote = `Supposed to deliver on ${oldDateStr}`;
          updatedDateChangeNotes = dateChangeNotes ? `${dateChangeNotes}\n${dateNote}` : dateNote;
          dateWasChanged = true;
        }
      }

      // Get company from selected truck or driver (driver1), or preserve existing
      const selectedTruck = trucks?.find((t) => t.id === truck);
      const selectedDriver1 = drivers?.find((d) => d.id === driver1);
      const companyId = selectedTruck?.company_id || selectedDriver1?.company_id;

      const currentSnapshot = buildCurrentSnapshot();

      // Build the final notes
      let finalUserNotes = userNotes;
      let finalSystemNotes = systemNotes;

      // If there's a change note, append it to user notes
      if (changeNote) {
        finalUserNotes = appendUserNote(userNotes, changeNote, profile?.full_name || profile?.email || "Unknown");
      }

      // If there are system changes, append them to system notes
      if (originalSnapshot && pendingChanges.length > 0) {
        finalSystemNotes = appendChangesToNotes(systemNotes, pendingChanges);
      }

      // Combine notes for storage
      const updatedNotes = combineNotes(finalUserNotes, finalSystemNotes);

      const updateData: any = {
        broker_load_number: brokerLoadNumber || null,
        booked_by_company_id: bookedByCompany || null,
        broker_id: broker || null,
        truck_id: truck || null,
        trailer_id: trailerId || null,
        driver1_id: driver1 || null,
        driver2_id: driver2 || null,
        pickup_datetime:
          firstPickup?.dateRange?.from && firstPickup?.startTime
            ? combineDateAndTime(firstPickup.dateRange.from, firstPickup.startTime)
            : null,
        pickup_end_datetime:
          lastPickup?.dateRange?.from && lastPickup?.endTime
            ? combineDateAndTime(lastPickup.dateRange.from, lastPickup.endTime)
            : null,
        delivery_datetime:
          firstDelivery?.dateRange?.from && firstDelivery?.startTime
            ? combineDateAndTime(firstDelivery.dateRange.from, firstDelivery.startTime)
            : null,
        delivery_end_datetime:
          lastDelivery?.dateRange?.from && lastDelivery?.endTime
            ? combineDateAndTime(lastDelivery.dateRange.from, lastDelivery.endTime)
            : null,
        freight_amount: freightAmount ? parseFloat(freightAmount) : null,
        detention: detention ? parseFloat(detention) : null,
        layover: layover ? parseFloat(layover) : null,
        extra_stop: extraStop ? parseFloat(extraStop) : null,
        lumper: lumper ? parseFloat(lumper) : null,
        late_fee: lateFee ? parseFloat(lateFee) : null,
        driver_price: driverPrice ? parseFloat(driverPrice) : null,
        tonu: tonu ? parseFloat(tonu) : null,
        detention_driver: detentionDriver !== "" ? parseFloat(detentionDriver) : null,
        layover_driver: layoverDriver !== "" ? parseFloat(layoverDriver) : null,
        late_fee_driver: lateFeeDriver !== "" ? parseFloat(lateFeeDriver) : null,
        tonu_driver: tonuDriver !== "" ? parseFloat(tonuDriver) : null,
        no_tracking_fee: noTrackingFee !== "" ? parseFloat(noTrackingFee) : null,
        no_tracking_fee_driver: noTrackingFeeDriver !== "" ? parseFloat(noTrackingFeeDriver) : null,
        wrong_address_fee: wrongAddressFee !== "" ? parseFloat(wrongAddressFee) : null,
        wrong_address_fee_driver: wrongAddressFeeDriver !== "" ? parseFloat(wrongAddressFeeDriver) : null,
        other_charges: otherCharges !== "" ? parseFloat(otherCharges) : null,
        other_charges_driver: otherChargesDriver !== "" ? parseFloat(otherChargesDriver) : null,
        other_charges_reason: otherChargesReason || null,
        other_charges_items: otherChargesItems.length > 0 ? otherChargesItems : null,
        other_additionals: otherAdditionals !== "" ? parseFloat(otherAdditionals) : null,
        other_additionals_driver: otherAdditionalsDriver !== "" ? parseFloat(otherAdditionalsDriver) : null,
        other_additionals_reason: otherAdditionalsReason || null,
        other_additionals_items: otherAdditionalsItems.length > 0 ? otherAdditionalsItems : null,
        additional_miles: additionalMiles ? parseInt(additionalMiles) : 0,
        loaded_miles: loadedMiles ? parseInt(loadedMiles) : null,
        dh_miles: dhMiles ? parseInt(dhMiles) : null,
        mileage: (parseInt(loadedMiles) || 0) + (parseInt(dhMiles) || 0) + (parseInt(additionalMiles) || 0) || null,
        commodity: commodity || null,
        weight: weight ? parseFloat(weight) : null,
        reference_number: referenceNumber || null,
        po_number: poNumber || null,
        pu_number: puNumber || null,
        notes: updatedNotes || null,
        booked_by: bookedBy || null,
        escort_fee: escortFee ? parseFloat(escortFee) : null,
        escort_fee_broker_paid: escortFeeBrokerPaid,
        date_change_notes: updatedDateChangeNotes || null,
        canceled: Boolean(tonu && parseFloat(tonu) > 0),
        locked: isLocked,
      };

      // company_id is frozen at creation — never update it (changing it causes duplicate internal load numbers)

      const { error: orderError } = await supabase.from("orders").update(updateData).eq("id", id);
      if (orderError) throw orderError;

      // Upload new files if any
      const allFiles = [
        {
          files: rcFiles,
          category: "RC",
        },
        {
          files: bolFiles,
          category: "BOL",
        },
        {
          files: podFiles,
          category: "POD",
        },
        {
          files: additionalFiles,
          category: "ADDITIONAL",
        },
      ];

      // If uploading revised RC, delete all existing RC files first
      if (rcFiles && rcFiles.length > 0) {
        const existingRcFiles = existingFiles.filter((f) => f.file_category === "RC");
        for (const file of existingRcFiles) {
          // Delete from storage first
          const { error: storageErr } = await supabase.storage.from("order-files").remove([file.file_path]);
          if (storageErr) {
            console.error(`Storage delete failed for ${file.file_path}:`, storageErr);
          }
          // Delete from database only if storage succeeded (or file was already gone)
          const { error: dbErr } = await supabase.from("order_files").delete().eq("id", file.id);
          if (dbErr) {
            console.error(`DB delete failed for order_files id=${file.id}:`, dbErr);
            toast({
              title: "Error",
              description: `Failed to delete file record for ${file.file_name}. Please try again.`,
              variant: "destructive",
            });
          }
        }
        // Update local state to remove deleted RC files
        setExistingFiles((prev) => prev.filter((f) => f.file_category !== "RC"));
      }

      // Track which file categories were newly uploaded for auto-setting checkout times
      const chicagoTime = toZonedTime(new Date(), "America/Chicago");
      const checkoutTimestamp = chicagoTime.toISOString();
      let bolUploaded = false;
      let podUploaded = false;
      let newPodCount = 0;

      for (const { files, category } of allFiles) {
        if (files && files.length > 0) {
          if (category === "BOL") bolUploaded = true;
          if (category === "POD") {
            podUploaded = true;
            newPodCount = files.length;
          }

          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const filePath = await uploadOrderFilePreserveName({
              orderId: id,
              folder: category,
              file,
            });

            // Save file metadata
            const { error: fileError } = await supabase.from("order_files").insert({
              order_id: id,
              file_name: file.name,
              file_path: filePath,
              file_size: file.size,
              content_type: file.type,
              file_category: category,
              uploaded_by: profile?.full_name || profile?.email || "Unknown User",
            });
            if (fileError) throw fileError;
          }
        }
      }

      // Delete files marked for deletion
      if (filesToDelete.length > 0) {
        const filesToDeleteData = existingFiles.filter((f) => filesToDelete.includes(f.id));

        for (const file of filesToDeleteData) {
          // Delete from storage first
          const { error: storageErr } = await supabase.storage.from("order-files").remove([file.file_path]);
          if (storageErr) {
            console.error(`Storage delete failed for ${file.file_path}:`, storageErr);
          }
          // Delete DB row only after storage delete (or if file was already missing)
          const { error: dbErr } = await supabase.from("order_files").delete().eq("id", file.id);
          if (dbErr) {
            console.error(`DB delete failed for order_files id=${file.id}:`, dbErr);
            toast({
              title: "Error",
              description: `Failed to delete file record for ${file.file_name}. Please try again.`,
              variant: "destructive",
            });
          }
        }

        // Update local state
        setExistingFiles(existingFiles.filter((f) => !filesToDelete.includes(f.id)));
        setFilesToDelete([]);
      }

      // Smart UPDATE/INSERT/DELETE to avoid unique constraint violations
      if (pickupsDrops.length > 0) {
        // Get existing pickup_drops with all details
        const { data: existingPickupDrops } = await supabase
          .from("pickup_drops")
          .select("id, sequence_number")
          .eq("order_id", id)
          .order("sequence_number");
        const existing = existingPickupDrops || [];

        // Prepare pickup_drop data with proper sequence numbers (async for geocoding)
        const formPickupDrops = await Promise.all(
          pickupsDrops
            .filter((item) => item.address)
            .map(async (item, index) => {
              let datetime = null;
              let endDatetime = null;
              if (item.dateRange?.from && item.startTime) {
                const [hours, minutes] = item.startTime.split(":");
                datetime = new Date(item.dateRange.from);
                datetime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
              }

              // Also save end time if provided
              if (item.dateRange?.from && item.endTime) {
                const [hours, minutes] = item.endTime.split(":");
                endDatetime = new Date(item.dateRange.from);
                endDatetime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
              }

              // Geocode if coordinates are missing
              let latitude = item.latitude || null;
              let longitude = item.longitude || null;

              if (!latitude || !longitude) {
                const fullAddress = [item.address, item.city, item.state, item.zipCode].filter(Boolean).join(", ");
                const coords = await geocodeAddress(fullAddress);
                if (coords) {
                  latitude = coords.lat;
                  longitude = coords.lon;
                  console.log(`📍 Geocoded at submission: ${fullAddress} -> ${latitude}, ${longitude}`);
                }
              }

              return {
                order_id: id,
                type: item.type,
                address: item.address || "",
                city: item.city || null,
                state: item.state || null,
                zip_code: item.zipCode || null,
                company_name: (item as any).companyName || null,
                datetime: datetime
                  ? `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, "0")}-${String(datetime.getDate()).padStart(2, "0")} ${String(datetime.getHours()).padStart(2, "0")}:${String(datetime.getMinutes()).padStart(2, "0")}:00`
                  : null,
                end_datetime: endDatetime
                  ? `${endDatetime.getFullYear()}-${String(endDatetime.getMonth() + 1).padStart(2, "0")}-${String(endDatetime.getDate()).padStart(2, "0")} ${String(endDatetime.getHours()).padStart(2, "0")}:${String(endDatetime.getMinutes()).padStart(2, "0")}:00`
                  : null,
                sequence_number: index + 1,
                contact_name: item.contactName || null,
                contact_phone: item.contactPhone || null,
                special_instructions: item.specialInstructions || null,
                latitude,
                longitude,
              };
            }),
        );

        // Step 1: Temporarily set all existing sequence numbers to negative to avoid conflicts
        for (let i = 0; i < existing.length; i++) {
          const { error: tempError } = await supabase
            .from("pickup_drops")
            .update({ sequence_number: -(i + 1000) })
            .eq("id", existing[i].id);
          if (tempError) throw tempError;
        }

        // Step 2: Update existing pickup_drops with new data
        for (let i = 0; i < Math.min(existing.length, formPickupDrops.length); i++) {
          const { error: updateError } = await supabase
            .from("pickup_drops")
            .update(formPickupDrops[i])
            .eq("id", existing[i].id);
          if (updateError) throw updateError;
        }

        // Step 3: Insert new pickup_drops if form has more than existing
        if (formPickupDrops.length > existing.length) {
          const newPickupDrops = formPickupDrops.slice(existing.length);
          const { error: insertError } = await supabase.from("pickup_drops").insert(newPickupDrops);
          if (insertError) throw insertError;
        }

        // Step 4: Delete extra pickup_drops if existing has more than form
        if (existing.length > formPickupDrops.length) {
          const idsToDelete = existing.slice(formPickupDrops.length).map((pd) => pd.id);
          const { error: deleteError } = await supabase.from("pickup_drops").delete().in("id", idsToDelete);
          if (deleteError) throw deleteError;
        }
      }

      // Auto-set checked_out_at for newly uploaded BOL/POD files
      if (bolUploaded || podUploaded) {
        // Fetch all pickup_drops for this order
        const { data: allPickupDrops } = await supabase
          .from("pickup_drops")
          .select("id, type, sequence_number")
          .eq("order_id", id)
          .order("sequence_number");

        if (allPickupDrops) {
          const pickups = allPickupDrops.filter((pd) => pd.type === "pickup");
          const deliveries = allPickupDrops.filter((pd) => pd.type === "delivery");

          // If BOL was uploaded, set checkout time for first pickup
          if (bolUploaded && pickups.length > 0) {
            const firstPickup = pickups[0];
            await supabase.from("pickup_drops").update({ checked_out_at: checkoutTimestamp }).eq("id", firstPickup.id);
          }

          // If POD was uploaded, set checkout time for corresponding delivery stops
          if (podUploaded && deliveries.length > 0) {
            // Get existing POD count before these uploads
            const { data: existingPods } = await supabase
              .from("order_files")
              .select("id")
              .eq("order_id", id)
              .eq("file_category", "POD");

            const totalPodCount = existingPods?.length || 0;
            // Update checkout times for newly uploaded PODs
            // If we had 2 PODs and uploaded 1 more, update delivery at index 2 (3rd delivery)
            const startIndex = totalPodCount - newPodCount;

            for (let i = 0; i < newPodCount && startIndex + i < deliveries.length; i++) {
              const delivery = deliveries[startIndex + i];
              await supabase.from("pickup_drops").update({ checked_out_at: checkoutTimestamp }).eq("id", delivery.id);
            }

            // Auto-set status to "delivered" when all deliveries have PODs
            if (totalPodCount >= deliveries.length) {
              await supabase.from("orders").update({ status: "delivered" }).eq("id", id);
            }
          }
        }
      }

      toast({
        title: "Success",
        description: "Load updated successfully",
      });

      // Update original delivery date if it was changed to prevent duplicate notes
      if (dateWasChanged && newDeliveryDatetime) {
        setOriginalDeliveryDate(new Date(newDeliveryDatetime));
        setDateChangeNotes(updatedDateChangeNotes);
      }

      // Clear adapter file cache so Reports grid shows correct state on return
      invalidateOrderFilesCacheForOrder(id);

      // Navigate back to the referring page
      navigateBack();
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "Error",
        description: "Failed to update load",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if any additionals (except lumper) have been added compared to original values
  const hasNewAdditionalsRequiringRC = useCallback((): boolean => {
    if (!originalSnapshot) return false;

    // Check each additional field (except lumper) - only require RC if value was added/increased
    const checkField = (current: string, original: number | null | undefined): boolean => {
      const currentVal = current ? parseFloat(current) : 0;
      const originalVal = original || 0;
      return currentVal > originalVal;
    };

    return (
      checkField(detention, originalSnapshot.detention) ||
      checkField(layover, originalSnapshot.layover) ||
      checkField(extraStop, originalSnapshot.extraStop) ||
      checkField(lateFee, originalSnapshot.lateFee) ||
      checkField(tonu, originalSnapshot.tonu) ||
      checkField(noTrackingFee, originalSnapshot.noTrackingFee) ||
      checkField(wrongAddressFee, originalSnapshot.wrongAddressFee) ||
      checkField(otherCharges, originalSnapshot.otherCharges) ||
      (parseFloat(otherAdditionals) || 0) > 0 || // otherAdditionals - just check if there's a value
      checkField(escortFee, originalSnapshot.escortFee)
    );
  }, [
    originalSnapshot,
    detention,
    layover,
    extraStop,
    lateFee,
    tonu,
    noTrackingFee,
    wrongAddressFee,
    otherCharges,
    otherAdditionals,
    escortFee,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log("Form submission already in progress, ignoring duplicate submission");
      return;
    }

    // Auto-add pending additional charges if user filled in values but didn't click Add
    const didAutoAddAdditional = additionalsManagerRef.current?.commitPendingAdditional?.() ?? false;

    if (didAutoAddAdditional) {
      // If we auto-added an additional, queue the submit for the next render
      // so that performSave reads the updated state values
      setQueuedSubmit({ changeNote: undefined });
      return;
    }

    // No auto-add happened, continue with immediate submit
    // Check if revised RC is required (additionals added except lumper)
    if (hasNewAdditionalsRequiringRC() && (!rcFiles || rcFiles.length === 0)) {
      toast({
        title: "Revised Rate Confirmation Required",
        description:
          "Please upload a Revised Rate Confirmation when adding additional charges (detention, layover, extra stop, late fee, TONU, etc.)",
        variant: "destructive",
      });
      return;
    }

    // Check if miles changed significantly from original values
    {
      const oldDh = baselineDhMiles;
      const newDh = parseInt(dhMiles) || 0;
      const oldLoaded = baselineLoadedMiles;
      const newLoaded = parseInt(loadedMiles) || 0;
      const milesCheck = checkMilesChange(oldDh, newDh, oldLoaded, newLoaded);
      if (milesCheck.significant) {
        setMilesChangeInfo({
          ...milesCheck,
          oldDhMiles: oldDh,
          newDhMiles: newDh,
          oldLoadedMiles: oldLoaded,
          newLoadedMiles: newLoaded,
        });
        setShowMilesChangeDialog(true);
        return;
      }
    }

    // Detect changes
    const changes = detectChanges();

    // If there are changes, show dialog to require user note
    if (changes.length > 0) {
      setPendingChanges(changes);
      setPendingSubmitEvent(e);
      setShowChangeNoteDialog(true);
      return;
    }

    // No changes detected, proceed with save
    setIsSubmitting(true);
    await performSave();
  };

  const handleChangeNoteConfirm = async (note: string) => {
    setShowChangeNoteDialog(false);

    // Auto-add pending additional charges if user filled in values but didn't click Add
    const didAutoAddAdditional = additionalsManagerRef.current?.commitPendingAdditional?.() ?? false;

    if (didAutoAddAdditional) {
      // If we auto-added an additional, queue the submit for the next render
      // so that performSave reads the updated state values
      setQueuedSubmit({ changeNote: note });
      return;
    }

    // No auto-add happened, continue with immediate save
    setIsSubmitting(true);
    await performSave(note);
    setPendingChanges([]);
    setPendingSubmitEvent(null);
  };

  const handleLeftAtYard = async () => {
    if (!id) return;

    try {
      // Get first pickup and last delivery coordinates for mile calculation
      const pickupsList = pickupsDrops.filter((pd) => pd.type === "pickup");
      const deliveriesList = pickupsDrops.filter((pd) => pd.type === "delivery");
      const firstPickup = pickupsList[0];
      const lastDelivery = deliveriesList[deliveriesList.length - 1];

      console.log("Left at yard - Current state:", {
        driver1,
        driver2,
        truck,
        trailerId,
        trailer,
        driversCount: drivers?.length,
        trucksCount: trucks?.length,
        pickupsDrops: pickupsDrops.length,
      });

      // Use user-entered miles or fall back to 0
      const originalMilesCalc = yardOriginalMiles ? Number(yardOriginalMiles) : 0;
      const recoveryMilesCalc = yardRecoveryMiles ? Number(yardRecoveryMiles) : 0;

      // Calculate original driver price proportionally if not manually entered
      const totalMiles = originalMilesCalc + recoveryMilesCalc || Number(loadedMiles) || 1;
      const originalDriverPriceCalc = originalDriverPrice
        ? Number(originalDriverPrice)
        : originalMilesCalc > 0
          ? Math.round((Number(driverPrice) || 0) * (originalMilesCalc / totalMiles))
          : 0;

      // Get current persisted assignment IDs (most reliable)
      const { data: currentOrder, error: currentOrderError } = await supabase
        .from("orders")
        .select("driver1_id, driver2_id, truck_id, trailer_id, is_recovery")
        .eq("id", id)
        .maybeSingle();

      if (currentOrderError) throw currentOrderError;

      // Fallback to state lookups (in case the user changed selections but didn't save)
      const currentDriver1 = drivers?.find((d) => d.id === driver1) || drivers?.find((d) => d.name === driver1);
      const currentDriver2 = drivers?.find((d) => d.id === driver2) || drivers?.find((d) => d.name === driver2);
      const currentTruck = trucks?.find((t) => t.id === truck) || trucks?.find((t) => t.truck_number === truck);
      const currentTrailer =
        trailers?.find((t) => t.id === trailerId) || trailers?.find((t) => t.trailer_number === trailer);

      const originalDriver1Id = currentOrder?.driver1_id || currentDriver1?.id || null;
      const originalDriver2Id = currentOrder?.driver2_id || currentDriver2?.id || null;
      const originalTruckId = currentOrder?.truck_id || currentTruck?.id || null;
      const originalTrailerId = currentOrder?.trailer_id || currentTrailer?.id || null;

      console.log("Found entities:", {
        originalDriver1Id,
        originalDriver2Id,
        originalTruckId,
        originalTrailerId,
        currentDriver1: currentDriver1?.name,
        currentDriver2: currentDriver2?.name,
        currentTruck: currentTruck?.truck_number,
        currentTrailer: currentTrailer?.trailer_number,
        isAlreadyRecovery: currentOrder?.is_recovery,
      });

      // Append yard reason to user notes
      const timestamp = new Date().toLocaleString();
      const yardNoteEntry = `[${timestamp}] Left at Yard: ${yardReason.trim()}`;
      const updatedUserNotes = userNotes ? `${userNotes}\n${yardNoteEntry}` : yardNoteEntry;
      const fullNotes = systemNotes ? `${updatedUserNotes}\n---\n${systemNotes}` : updatedUserNotes;

      // === ALREADY A TRANSFER LOAD - preserve original_* fields ===
      if (currentOrder?.is_recovery) {
        console.log("Load is already a recovery/transfer - appending to transfer chain");

        // Get the last transfer record
        const { data: existingTransfers } = await supabase
          .from("order_transfers")
          .select("*")
          .eq("order_id", id)
          .order("sequence_number", { ascending: false })
          .limit(1);

        const lastTransfer = existingTransfers?.[0];

        if (lastTransfer) {
          // Update last transfer with handoff location (where they left it at yard)
          await supabase
            .from("order_transfers")
            .update({
              transfer_city: "Lynwood",
              transfer_state: "IL",
              transfer_datetime: new Date().toISOString(),
              miles: originalMilesCalc || lastTransfer.miles,
              driver_price: originalDriverPriceCalc || lastTransfer.driver_price,
            })
            .eq("id", lastTransfer.id);
        }

        // Clear current assignment but do NOT overwrite original_* fields
        const reTransferUpdate: Record<string, any> = {
          driver1_id: null,
          driver2_id: null,
          truck_id: null,
          recovery_miles: recoveryMilesCalc,
          notes: fullNotes,
        };
        if (yardBolLocation.trim()) {
          reTransferUpdate.bol_location = yardBolLocation.trim();
        }

        const { error } = await supabase.from("orders").update(reTransferUpdate).eq("id", id);

        if (error) throw error;

        // Unassign trailer from truck
        if (originalTruckId) {
          const { error: truckError } = await supabase
            .from("trucks")
            .update({ trailer_id: null })
            .eq("id", originalTruckId);
          if (truckError) console.error("Error unassigning trailer from truck:", truckError);
        }

        toast({
          title: "Success",
          description: `Load marked as left at yard again. Miles to complete: ${recoveryMilesCalc}`,
        });

        setYardDialogOpen(false);
        setYardReason("");
        setYardBolLocation("");
        localStorage.setItem("returnToYardLoads", "true");
        navigate("/yard-loads");
        return; // Skip the first-time original_* overwrite path
      }

      // === FIRST TIME LEFT AT YARD - save original_* fields ===
      const updateData = {
        driver1_id: null,
        driver2_id: null,
        truck_id: null,
        is_recovery: true,
        original_driver1_id: originalDriver1Id,
        original_driver2_id: originalDriver2Id,
        original_truck_id: originalTruckId,
        original_trailer_id: originalTrailerId,
        original_miles: originalMilesCalc,
        original_driver_price: originalDriverPriceCalc,
        recovery_miles: recoveryMilesCalc,
      };

      const fullUpdateData: Record<string, any> = {
        ...updateData,
        notes: fullNotes,
      };
      if (yardBolLocation.trim()) {
        fullUpdateData.bol_location = yardBolLocation.trim();
      }

      console.log("Updating order with:", fullUpdateData);

      const { error } = await supabase.from("orders").update(fullUpdateData).eq("id", id);

      if (error) throw error;

      // Unassign trailer from truck when leaving at yard
      if (originalTruckId) {
        const { error: truckError } = await supabase
          .from("trucks")
          .update({ trailer_id: null })
          .eq("id", originalTruckId);

        if (truckError) {
          console.error("Error unassigning trailer from truck:", truckError);
        }
      }

      toast({
        title: "Success",
        description: `Load marked as left at yard. Original miles: ${originalMilesCalc}, Miles to complete: ${recoveryMilesCalc}`,
      });

      setYardDialogOpen(false);
      setYardReason("");
      setYardBolLocation("");
      localStorage.setItem("returnToYardLoads", "true");
      navigate("/yard-loads");
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "Error",
        description: "Failed to update load",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={navigateBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {returnToReports
                  ? "Back to Reports"
                  : returnToTrips
                    ? "Back to Trips"
                    : returnToAnalytics
                      ? "Back to Analytics"
                      : localStorage.getItem("returnToYardLoads") === "true"
                        ? "Back to Yard Loads"
                        : "Back to Orders"}
              </Button>
              <CardTitle className="text-2xl font-semibold">Edit Load</CardTitle>
              {isLocked && (
                <Badge variant="secondary" className="bg-yellow-500 text-yellow-950">
                  🔒 Locked - View Only
                </Badge>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Internal Load #</div>
              <div className="text-lg font-medium flex items-center gap-2 justify-end">
                {formatInternalLoadNumber(internalLoadNumber, drivers?.find((d) => d.id === driver1)?.company?.name)}
                {isPartial && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Layers className="h-4 w-4 text-primary" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Partial Load</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {!isPartial ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="broker-load-number">Broker Load #</Label>
                  <Input
                    id="broker-load-number"
                    placeholder="Broker load number"
                    value={brokerLoadNumber}
                    onChange={(e) => setBrokerLoadNumber(e.target.value)}
                    disabled={isLocked}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Booked by Company</Label>
                    <Combobox
                      options={companyOptions}
                      value={bookedByCompany}
                      onValueChange={setBookedByCompany}
                      placeholder="Select company"
                      searchPlaceholder="Search companies..."
                      disabled={isLocked}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="broker">Broker</Label>
                    <BrokerCombobox
                      value={broker}
                      onValueChange={setBroker}
                      placeholder="Select broker"
                      searchPlaceholder="Search brokers..."
                      disabled={isLocked}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-medium">Partial Load Details</Label>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    {partialBrokerLoadNumbers.filter(Boolean).length} Partials
                  </Badge>
                </div>

                <div
                  className={cn(
                    "grid gap-4",
                    partialBrokerLoadNumbers.length === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : partialBrokerLoadNumbers.length === 3
                        ? "grid-cols-1 md:grid-cols-3"
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
                  )}
                >
                  {partialBrokerLoadNumbers.map((loadNum, index) => {
                    const company = companies?.find((c) => c.id === partialBookedByCompanies[index]);
                    const brokerData = brokers?.find((b) => b.id === partialBrokers[index]);

                    return (
                      <Card key={index} className="border-2 border-blue-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm text-blue-700">Partial {index + 1}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Broker Load #</Label>
                            <Input value={loadNum || ""} disabled className="bg-muted" />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Company</Label>
                            <Input value={company?.name || ""} disabled className="bg-muted" />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Broker</Label>
                            <Input value={brokerData?.name || ""} disabled className="bg-muted" />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="truck">Truck #</Label>
                <Combobox
                  options={truckOptions}
                  value={truck}
                  onValueChange={setTruck}
                  placeholder="Select truck"
                  searchPlaceholder="Search trucks..."
                  disabled={isLocked}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailer">Trailer #</Label>
                <Combobox
                  options={trailerOptions}
                  value={deletedTrailerNumber && !trailerId ? "deleted" : trailerId}
                  onValueChange={(value) => {
                    if (value !== "deleted") {
                      setTrailerId(value);
                      setDeletedTrailerNumber("");
                    }
                  }}
                  placeholder="Select trailer"
                  searchPlaceholder="Search trailers..."
                  disabled={isLocked}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="driver1">Driver 1</Label>
                <Combobox
                  options={driverOptions}
                  value={driver1}
                  onValueChange={setDriver1}
                  placeholder="Select primary driver"
                  searchPlaceholder="Search drivers..."
                  disabled={isLocked}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver2">Driver 2 (Optional)</Label>
                <Combobox
                  options={[
                    {
                      value: "none",
                      label: "None",
                    },
                    ...driverOptions,
                  ]}
                  value={driver2 || "none"}
                  onValueChange={(value) => setDriver2(value === "none" ? "" : value)}
                  placeholder="Select second driver"
                  searchPlaceholder="Search drivers..."
                  disabled={isLocked}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Pickups & Deliveries</Label>
                {!isLocked && (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => addPickupDrop("pickup")}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Pickup
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => addPickupDrop("delivery")}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Delivery
                    </Button>
                  </div>
                )}
              </div>

              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="pickups-drops">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                      {[...pickupsDrops]
                        .sort((a, b) => {
                          // Sort pickups before deliveries
                          if (a.type === "pickup" && b.type === "delivery") return -1;
                          if (a.type === "delivery" && b.type === "pickup") return 1;
                          return 0;
                        })
                        .map((item, index) => (
                          <Draggable key={item.id} draggableId={item.id} index={index}>
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn("p-4", snapshot.isDragging && "shadow-lg")}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    {!isLocked && (
                                      <div {...provided.dragHandleProps}>
                                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                                      </div>
                                    )}
                                    {!isLocked ? (
                                      <button
                                        type="button"
                                        onClick={() => togglePickupDropType(item.id)}
                                        className={cn(
                                          "px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors",
                                          item.type === "pickup"
                                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                            : "bg-green-100 text-green-700 hover:bg-green-200",
                                        )}
                                        title="Click to toggle between Pickup and Delivery"
                                      >
                                        {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                      </button>
                                    ) : (
                                      <h4 className="font-medium capitalize">{item.type}</h4>
                                    )}
                                  </div>
                                  {!isLocked && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => removePickupDrop(item.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                  <div className="space-y-1">
                                    <Label htmlFor={`company-name-${item.id}`}>
                                      {item.type === "pickup" ? "Shipper Name" : "Receiver Name"}
                                    </Label>
                                    <Input
                                      id={`company-name-${item.id}`}
                                      placeholder={
                                        item.type === "pickup" ? "Shipper company name" : "Receiver company name"
                                      }
                                      value={item.companyName || ""}
                                      onChange={(e) => {
                                        const updated = pickupsDrops.map((p) =>
                                          p.id === item.id
                                            ? {
                                                ...p,
                                                companyName: e.target.value,
                                              }
                                            : p,
                                        );
                                        setPickupsDrops(updated);
                                      }}
                                      disabled={isLocked}
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label htmlFor={`address-${item.id}`}>Street Address</Label>
                                    <Input
                                      id={`address-${item.id}`}
                                      placeholder="123 Main St"
                                      value={item.address}
                                      onChange={(e) => updatePickupDrop(item.id, "address", e.target.value)}
                                      disabled={isLocked}
                                    />
                                  </div>

                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="space-y-1 col-span-1">
                                      <Label htmlFor={`city-${item.id}`}>City</Label>
                                      <Input
                                        id={`city-${item.id}`}
                                        placeholder="City"
                                        value={item.city || ""}
                                        onChange={(e) => updatePickupDrop(item.id, "city", e.target.value)}
                                        disabled={isLocked}
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <Label htmlFor={`state-${item.id}`}>State</Label>
                                      <Select
                                        value={item.state || ""}
                                        onValueChange={(value) => updatePickupDrop(item.id, "state", value)}
                                        disabled={isLocked}
                                      >
                                        <SelectTrigger id={`state-${item.id}`}>
                                          <SelectValue placeholder="ST" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {US_STATES.map((state) => (
                                            <SelectItem key={state.value} value={state.value}>
                                              {state.value}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label htmlFor={`zip-${item.id}`}>Zip Code</Label>
                                      <Input
                                        id={`zip-${item.id}`}
                                        placeholder="12345"
                                        value={item.zipCode || ""}
                                        onChange={(e) => {
                                          // Only allow numbers and limit to 10 characters (for 12345-6789 format)
                                          const value = e.target.value.replace(/[^\d-]/g, "").slice(0, 10);
                                          updatePickupDrop(item.id, "zipCode", value);
                                        }}
                                        maxLength={10}
                                        disabled={isLocked}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <Label htmlFor={`daterange-${item.id}`}>Date & Time Range</Label>
                                    <DateTimeRangePicker
                                      date={item.dateRange}
                                      onDateChange={(dateRange) => updatePickupDropDateRange(item.id, dateRange)}
                                      startTime={item.startTime || ""}
                                      endTime={item.endTime || ""}
                                      onStartTimeChange={(time) => updatePickupDropTime(item.id, "startTime", time)}
                                      onEndTimeChange={(time) => updatePickupDropTime(item.id, "endTime", time)}
                                      placeholder={`Select ${item.type} date and time range`}
                                      disabled={isLocked}
                                    />
                                  </div>

                                  {item.type === "delivery" && dateChangeNotes && (
                                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                                      {dateChangeNotes}
                                    </div>
                                  )}
                                </div>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="freight-amount">Freight Amount (Base)</Label>
                <Input
                  id="freight-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Freight amount"
                  value={freightAmount}
                  onKeyDown={handleNumericKeyDown}
                  onChange={handleNumericChange(setFreightAmount)}
                  disabled={isLocked}
                />
                <p className="text-sm text-muted-foreground">
                  Total Company Revenue:{" "}
                  <span className="font-semibold text-primary">${totalCompanyRevenue.toFixed(2)}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-price">Stop Amt (Base)</Label>
                <Input
                  id="driver-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Stop Amt"
                  value={driverPrice}
                  onKeyDown={handleNumericKeyDown}
                  onChange={handleNumericChange(setDriverPrice)}
                  disabled={isLocked}
                />
                <p className="text-sm text-muted-foreground">
                  Total Stop Amt:{" "}
                  <span className="font-semibold text-green-600 dark:text-green-400">${totalDriverPay.toFixed(2)}</span>
                </p>
              </div>
            </div>

            {/* Additional Button */}
            {!showAdditionalFields && !isLocked && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdditionalFields(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Additional
                </Button>
              </div>
            )}

            {/* Additional Fields Section */}
            {showAdditionalFields && (
              <div className="space-y-4 border border-muted rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Additional Charges</Label>
                </div>

                {/* New unified additionals manager */}
                <OrderAdditionalsManager
                  ref={additionalsManagerRef}
                  detention={detention}
                  setDetention={setDetention}
                  detentionDriver={detentionDriver}
                  setDetentionDriver={setDetentionDriver}
                  layover={layover}
                  setLayover={setLayover}
                  layoverDriver={layoverDriver}
                  setLayoverDriver={setLayoverDriver}
                  extraStop={extraStop}
                  setExtraStop={setExtraStop}
                  lumper={lumper}
                  setLumper={setLumper}
                  lateFee={lateFee}
                  setLateFee={setLateFee}
                  lateFeeDriver={lateFeeDriver}
                  setLateFeeDriver={setLateFeeDriver}
                  noTrackingFee={noTrackingFee}
                  setNoTrackingFee={setNoTrackingFee}
                  noTrackingFeeDriver={noTrackingFeeDriver}
                  setNoTrackingFeeDriver={setNoTrackingFeeDriver}
                  wrongAddressFee={wrongAddressFee}
                  setWrongAddressFee={setWrongAddressFee}
                  wrongAddressFeeDriver={wrongAddressFeeDriver}
                  setWrongAddressFeeDriver={setWrongAddressFeeDriver}
                  tonu={tonu}
                  setTonu={setTonu}
                  tonuDriver={tonuDriver}
                  setTonuDriver={setTonuDriver}
                  otherChargesItems={otherChargesItems}
                  setOtherChargesItems={setOtherChargesItems}
                  otherAdditionalsItems={otherAdditionalsItems}
                  setOtherAdditionalsItems={setOtherAdditionalsItems}
                  onTonuChange={(value) => {
                    if (value === "" || parseFloat(value) >= 0) {
                      setTonu(value);
                      // If TONU has a value, set freight amount, loaded miles, and driver price to 0
                      if (value && parseFloat(value) > 0) {
                        setFreightAmount("0");
                        setLoadedMiles("0");
                        setDriverPrice("0");
                      }
                    }
                  }}
                  isLocked={isLocked}
                />

                {/* Escort Fee and Additional Miles Section - kept separate */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-muted">
                  <div className="space-y-2">
                    <Label htmlFor="escort-fee">Escort Fee</Label>
                    <Input
                      id="escort-fee"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={escortFee}
                      onKeyDown={handleNumericKeyDown}
                      onChange={handleNumericChange(setEscortFee)}
                      className="bg-green-50/50 dark:bg-green-950/20"
                      disabled={isLocked}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="escort-broker-paid">Broker Paid Escort Fee</Label>
                    <div className="flex items-center gap-3 h-10">
                      <Switch
                        id="escort-broker-paid"
                        checked={escortFeeBrokerPaid}
                        onCheckedChange={setEscortFeeBrokerPaid}
                        disabled={isLocked}
                      />
                      <span className="text-sm text-muted-foreground">
                        {escortFeeBrokerPaid ? "✓ Included" : "Not included"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="additional-miles">Additional Miles</Label>
                    <Input
                      id="additional-miles"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={additionalMiles}
                      onKeyDown={handleNumericKeyDown}
                      onChange={handleNumericChange(setAdditionalMiles)}
                      className="bg-green-50/50 dark:bg-green-950/20"
                      disabled={isLocked}
                    />
                    <p className="text-xs text-muted-foreground">Added to loaded miles</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loaded-miles">Loaded Miles</Label>
                <Input
                  id="loaded-miles"
                  type="number"
                  min="0"
                  placeholder="Loaded miles"
                  value={loadedMiles}
                  onKeyDown={handleNumericKeyDown}
                  onChange={handleNumericChange(setLoadedMiles)}
                  disabled={isLocked}
                />
                {parseInt(additionalMiles) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total Mileage:{" "}
                    {(parseInt(loadedMiles) || 0) + (parseInt(dhMiles) || 0) + (parseInt(additionalMiles) || 0)} mi (+{" "}
                    {additionalMiles} additional)
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dh-miles">DH Miles</Label>
                <Input
                  id="dh-miles"
                  type="number"
                  min="0"
                  placeholder="Deadhead miles"
                  value={dhMiles}
                  onKeyDown={handleNumericKeyDown}
                  onChange={handleNumericChange(setDhMiles)}
                  disabled={isLocked}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="booked-by">Booked By</Label>
                {hasRole("manager") || hasRole("admin") ? (
                  <Combobox
                    options={[
                      // Include current bookedBy value if it's not in profiles (deleted user)
                      ...(bookedBy && !profiles.find((p) => p.full_name === bookedBy)
                        ? [{ value: bookedBy, label: `${bookedBy} (deleted)` }]
                        : []),
                      ...profiles.map((p) => ({
                        value: p.full_name,
                        label: p.full_name,
                      })),
                    ]}
                    value={bookedBy}
                    onValueChange={setBookedBy}
                    placeholder="Select person"
                    searchPlaceholder="Search names..."
                    disabled={isLocked}
                  />
                ) : (
                  <Input
                    id="booked-by"
                    value={bookedBy || "Not assigned"}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-notes">User Notes</Label>
                <Textarea
                  id="user-notes"
                  placeholder="Add your notes here..."
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  rows={3}
                  disabled={isLocked}
                />
              </div>

              {systemNotes && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground font-medium">System Notes (Auto-generated)</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 max-h-[200px] overflow-y-auto">
                    <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">{systemNotes}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Transfer Details Section */}
            {isRecovery && (
              <div className="space-y-4 p-4 border border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="bg-amber-500">
                    TRANSFER LOAD
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {recoveryDate && `Transfer Date: ${new Date(recoveryDate).toLocaleDateString()}`}
                  </span>
                  {trailersSwapped && (
                    <Badge variant="secondary" className="bg-blue-500">
                      TRAILERS SWAPPED
                    </Badge>
                  )}
                </div>

                {/* Show transfers - combine legacy and order_transfers data */}
                {(() => {
                  // Check if we have sequence 0 (original) in order_transfers
                  const hasOriginalInTable = orderTransfers.some((t) => t.sequence_number === 0);
                  // Check if we have sequence 1 (first transfer) in order_transfers
                  const hasTransfer1InTable = orderTransfers.some((t) => t.sequence_number === 1);
                  // Get additional transfers (sequence >= 2) from order_transfers
                  const additionalTransfers = orderTransfers.filter((t) => t.sequence_number >= 2);

                  // If we have all data in order_transfers, show only from table
                  if (hasOriginalInTable && hasTransfer1InTable) {
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {orderTransfers.map((transfer) => (
                          <div key={transfer.id} className="space-y-3 p-3 bg-background/50 rounded-lg border relative">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-sm">
                                {transfer.sequence_number === 0 ? "Original" : `Transfer #${transfer.sequence_number}`}
                              </h4>
                              {!isLocked && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditingTransfer({
                                      id: transfer.id,
                                      sequenceNumber: transfer.sequence_number,
                                      driverId: transfer.driver1_id,
                                      driverName: transfer.manual_driver_name || transfer.driver1?.name,
                                      truckId: transfer.truck_id,
                                      truckNumber: transfer.manual_truck_number || transfer.truck?.truck_number,
                                      trailerId: transfer.trailer_id,
                                      trailerNumber: transfer.manual_trailer_number || transfer.trailer?.trailer_number,
                                      miles: transfer.miles,
                                      driverPrice: transfer.driver_price,
                                      transferCity: transfer.transfer_city,
                                      transferState: transfer.transfer_state,
                                      transferAddress: transfer.transfer_address,
                                      transferDatetime: transfer.transfer_datetime,
                                    });
                                    setEditTransferDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Driver:</span>{" "}
                                <span className="font-medium">
                                  {transfer.manual_driver_name || transfer.driver1?.name || "N/A"}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Truck:</span>{" "}
                                <span className="font-medium">
                                  {transfer.manual_truck_number || transfer.truck?.truck_number || "N/A"}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Trailer:</span>{" "}
                                <span className="font-medium">
                                  {transfer.manual_trailer_number || transfer.trailer?.trailer_number || "N/A"}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Miles:</span>{" "}
                                <span className="font-medium">{transfer.miles || "0"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Stop Amt:</span>{" "}
                                <span className="font-medium">
                                  ${parseFloat(transfer.driver_price || "0").toFixed(2)}
                                </span>
                              </div>
                              {/* Locations */}
                              {(() => {
                                const seq = transfer.sequence_number || 0;
                                const prev = orderTransfers.find((t) => (t.sequence_number || 0) === seq - 1);
                                const hasNext = orderTransfers.some((t) => (t.sequence_number || 0) === seq + 1);

                                // Pickup location for Transfer #N is the previous segment's handoff (seq N-1).
                                // Legacy fallback (missing previous): use this transfer's own location.
                                const pickupSource =
                                  seq === 0
                                    ? null
                                    : prev?.transfer_city || prev?.transfer_state
                                      ? prev
                                      : transfer.transfer_city || transfer.transfer_state
                                        ? transfer
                                        : null;

                                // Only show "No location set" prompt for handoff when a NEXT transfer exists.
                                // This prevents prompts on the last transfer (e.g. Transfer #1 when there's no Transfer #2).
                                const shouldShowHandoff = seq === 0 || hasNext;

                                return (
                                  <>
                                    {seq !== 0 && pickupSource && (
                                      <div className="pt-2 border-t mt-2">
                                        <div className="flex items-center gap-1 text-muted-foreground mb-1">
                                          <MapPin className="h-3 w-3" />
                                          <span className="text-xs">Pickup Location</span>
                                        </div>
                                        <div className="font-medium">
                                          {pickupSource.transfer_city}, {pickupSource.transfer_state}
                                        </div>
                                        {/* Use THIS transfer's datetime (when they picked up), not previous transfer's */}
                                        {transfer.transfer_datetime && (
                                          <div className="text-muted-foreground text-xs">
                                            {(() => {
                                              const parsed = parseSimpleDateTime(transfer.transfer_datetime);
                                              const date = new Date(
                                                parsed.year,
                                                parsed.month - 1,
                                                parsed.day,
                                                parsed.hours,
                                                parsed.minutes,
                                              );
                                              return date.toLocaleString("en-US", {
                                                month: "numeric",
                                                day: "numeric",
                                                year: "numeric",
                                                hour: "numeric",
                                                minute: "2-digit",
                                                second: "2-digit",
                                                hour12: true,
                                              });
                                            })()}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {shouldShowHandoff &&
                                      (transfer.transfer_city || transfer.transfer_state ? (
                                        <div className="pt-2 border-t mt-2">
                                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                                            <MapPin className="h-3 w-3" />
                                            <span className="text-xs">Handoff Location</span>
                                          </div>
                                          <div className="font-medium">
                                            {transfer.transfer_city}, {transfer.transfer_state}
                                          </div>
                                          {transfer.transfer_datetime && (
                                            <div className="text-muted-foreground text-xs">
                                              {(() => {
                                                const parsed = parseSimpleDateTime(transfer.transfer_datetime);
                                                const date = new Date(
                                                  parsed.year,
                                                  parsed.month - 1,
                                                  parsed.day,
                                                  parsed.hours,
                                                  parsed.minutes,
                                                );
                                                return date.toLocaleString("en-US", {
                                                  month: "numeric",
                                                  day: "numeric",
                                                  year: "numeric",
                                                  hour: "numeric",
                                                  minute: "2-digit",
                                                  second: "2-digit",
                                                  hour12: true,
                                                });
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="pt-2 border-t mt-2">
                                          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                            <MapPin className="h-3 w-3" />
                                            <span className="text-xs">No location set - click edit to add</span>
                                          </div>
                                        </div>
                                      ))}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  // Otherwise, show legacy Original/Transfer #1 plus any additional from order_transfers
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Legacy Original Assignment */}
                      <div className="space-y-3 p-3 bg-background/50 rounded-lg border relative">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm">Original</h4>
                          {!isLocked && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingTransfer({
                                  id: `legacy-original-${id}`,
                                  sequenceNumber: 0,
                                  driverId: undefined,
                                  driverName: originalDriverName,
                                  truckId: undefined,
                                  truckNumber: originalTruckNumber,
                                  trailerId: undefined,
                                  trailerNumber: originalTrailerNumber,
                                  miles: parseFloat(originalMiles) || 0,
                                  driverPrice: parseFloat(originalDriverPrice) || 0,
                                  transferCity: "",
                                  transferState: "",
                                  transferAddress: "",
                                  transferDatetime: "",
                                  isLegacy: true,
                                });
                                setEditTransferDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Driver:</span>{" "}
                            <span className="font-medium">{originalDriverName || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Truck:</span>{" "}
                            <span className="font-medium">{originalTruckNumber || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Trailer:</span>{" "}
                            <span className="font-medium">{originalTrailerNumber || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Miles:</span>{" "}
                            <span className="font-medium">{originalMiles || "0"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Stop Amt:</span>{" "}
                            <span className="font-medium">${parseFloat(originalDriverPrice || "0").toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Legacy Transfer #1 */}
                      <div className="space-y-3 p-3 bg-background/50 rounded-lg border relative">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm">Transfer #1</h4>
                          {!isLocked && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingTransfer({
                                  id: `legacy-transfer1-${id}`,
                                  sequenceNumber: 1,
                                  driverId: driver1,
                                  driverName: drivers?.find((d) => d.id === driver1)?.name,
                                  truckId: truck,
                                  truckNumber: trucks?.find((t) => t.id === truck)?.truck_number,
                                  trailerId: trailerId,
                                  trailerNumber: trailer,
                                  miles: parseFloat(recoveryMiles) || 0,
                                  driverPrice: parseFloat(recoveryDriverPrice) || 0,
                                  transferCity: "",
                                  transferState: "",
                                  transferAddress: "",
                                  transferDatetime: "",
                                  isLegacy: true,
                                });
                                setEditTransferDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Driver:</span>{" "}
                            <span className="font-medium">{drivers?.find((d) => d.id === driver1)?.name || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Truck:</span>{" "}
                            <span className="font-medium">
                              {trucks?.find((t) => t.id === truck)?.truck_number || "N/A"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Trailer:</span>{" "}
                            <span className="font-medium">{trailer || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Miles:</span>{" "}
                            <span className="font-medium">{recoveryMiles || "0"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Stop Amt:</span>{" "}
                            <span className="font-medium">${parseFloat(recoveryDriverPrice || "0").toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Additional transfers from order_transfers */}
                      {additionalTransfers.map((transfer) => (
                        <div key={transfer.id} className="space-y-3 p-3 bg-background/50 rounded-lg border">
                          <h4 className="font-semibold text-sm">Transfer #{transfer.sequence_number}</h4>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Driver:</span>{" "}
                              <span className="font-medium">
                                {transfer.manual_driver_name || transfer.driver1?.name || "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Truck:</span>{" "}
                              <span className="font-medium">
                                {transfer.manual_truck_number || transfer.truck?.truck_number || "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Trailer:</span>{" "}
                              <span className="font-medium">
                                {transfer.manual_trailer_number || transfer.trailer?.trailer_number || "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Miles:</span>{" "}
                              <span className="font-medium">{transfer.miles || "0"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Stop Amt:</span>{" "}
                              <span className="font-medium">
                                ${parseFloat(transfer.driver_price || "0").toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {trailersSwapped && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Note:</strong> Trailers were swapped during transfer. The load kept its original trailer,
                      but the trucks exchanged trailers.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* File Upload Sections - Disabled when locked */}
            {isLocked && (
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">File uploads are disabled for locked orders</p>
              </div>
            )}
            {!isLocked && (
              <>
                {/* RC Upload Section - Top Priority */}
                <Card
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-md",
                    dragStates.rc && "border-blue-400 bg-blue-50/50 scale-[1.02]",
                  )}
                  {...rcDragHandlers}
                  onClick={handleCardClick("rc")}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-blue-700 flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Revised Rate Confirmation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-blue-700 mb-3">
                      {rcFiles && rcFiles.length > 0
                        ? `${rcFiles.length} file(s) selected`
                        : "Click or drag files here"}
                    </p>

                    {dragStates.rc ? (
                      <div className="border-2 border-dashed border-blue-400 rounded-lg p-6 text-center bg-blue-50">
                        <FileText className="mx-auto h-8 w-8 text-blue-500 mb-2" />
                        <p className="text-sm text-blue-600 font-medium">Drop files here</p>
                      </div>
                    ) : (
                      <>
                        {rcFiles && rcFiles.length > 0 && (
                          <div className="space-y-1 mb-2">
                            {Array.from(rcFiles).map((file, index) => (
                              <div key={index} className="flex items-center gap-1 text-sm text-gray-600">
                                <FileText className="h-4 w-4" />
                                <span className="truncate">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    <input
                      ref={rcFileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setRcFiles(e.target.files)}
                      className="hidden"
                    />
                    <p className="text-xs text-blue-600">
                      Upload revised rate confirmation when adding additional charges.
                    </p>
                  </CardContent>
                </Card>

                {/* Additional File Upload Sections */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card
                    className={cn(
                      "cursor-pointer transition-all duration-200 hover:shadow-md",
                      dragStates.bol && "border-green-400 bg-green-50/50 scale-[1.02]",
                    )}
                    {...bolDragHandlers}
                    onClick={handleCardClick("bol")}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-green-700 flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        BOL (Bill of Lading)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dragStates.bol ? (
                        <div className="border-2 border-dashed border-green-400 rounded-lg p-4 text-center bg-green-50">
                          <FileText className="mx-auto h-6 w-6 text-green-500 mb-1" />
                          <p className="text-xs text-green-600 font-medium">Drop files here</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-green-600 mb-2">
                            {bolFiles && bolFiles.length > 0
                              ? `${bolFiles.length} file(s) selected`
                              : "Click or drag files here"}
                          </p>
                          {bolFiles && bolFiles.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {Array.from(bolFiles).map((file, index) => (
                                <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                                  <FileText className="h-3 w-3" />
                                  <span className="truncate">{file.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      <input
                        ref={bolFileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setBolFiles(e.target.files)}
                        className="hidden"
                      />
                      <p className="text-xs text-green-600">Bill of lading documents</p>
                    </CardContent>
                  </Card>

                  <Card
                    className={cn(
                      "cursor-pointer transition-all duration-200 hover:shadow-md",
                      dragStates.pod && "border-purple-400 bg-purple-50/50 scale-[1.02]",
                    )}
                    {...podDragHandlers}
                    onClick={handleCardClick("pod")}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-purple-700 flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        POD (Proof of Delivery)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dragStates.pod ? (
                        <div className="border-2 border-dashed border-purple-400 rounded-lg p-4 text-center bg-purple-50">
                          <FileText className="mx-auto h-6 w-6 text-purple-500 mb-1" />
                          <p className="text-xs text-purple-600 font-medium">Drop files here</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-purple-600 mb-2">
                            {podFiles && podFiles.length > 0
                              ? `${podFiles.length} file(s) selected`
                              : "Click or drag files here"}
                          </p>
                          {podFiles && podFiles.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {Array.from(podFiles).map((file, index) => (
                                <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                                  <FileText className="h-3 w-3" />
                                  <span className="truncate">{file.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      <input
                        ref={podFileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setPodFiles(e.target.files)}
                        className="hidden"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-purple-600">Delivery confirmation documents</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openScanner("POD");
                          }}
                        >
                          <ScanLine className="h-3 w-3 mr-1" />
                          Scan
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className={cn(
                      "cursor-pointer transition-all duration-200 hover:shadow-md",
                      dragStates.additional && "border-orange-400 bg-orange-50/50 scale-[1.02]",
                    )}
                    {...additionalDragHandlers}
                    onClick={handleCardClick("additional")}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-orange-700 flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Additional Documents
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dragStates.additional ? (
                        <div className="border-2 border-dashed border-orange-400 rounded-lg p-4 text-center bg-orange-50">
                          <FileText className="mx-auto h-6 w-6 text-orange-500 mb-1" />
                          <p className="text-xs text-orange-600 font-medium">Drop files here</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-orange-600 mb-2">
                            {additionalFiles && additionalFiles.length > 0
                              ? `${additionalFiles.length} file(s) selected`
                              : "Click or drag files here"}
                          </p>
                          {additionalFiles && additionalFiles.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {Array.from(additionalFiles).map((file, index) => (
                                <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                                  <FileText className="h-3 w-3" />
                                  <span className="truncate">{file.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      <input
                        ref={additionalFileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setAdditionalFiles(e.target.files)}
                        className="hidden"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-orange-600">Other supporting documents</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openScanner("ADDITIONAL");
                          }}
                        >
                          <ScanLine className="h-3 w-3 mr-1" />
                          Scan
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {existingFiles.length > 0 && (
              <div className="space-y-2">
                <Label>Existing Files</Label>
                <div className="flex flex-wrap gap-2">
                  {existingFiles
                    .filter((file) => !filesToDelete.includes(file.id))
                    .map((file) => (
                      <div key={file.id} className="flex items-center gap-2 p-2 border rounded">
                        <span className="text-sm">
                          {file.file_name} ({file.file_category || "ADDITIONAL"})
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={async () => {
                            const { signedUrl, error } = await getOrderFileSignedUrl({
                              id: file.id,
                              order_id: (file as any).order_id,
                              file_category: file.file_category,
                              file_name: file.file_name,
                              file_path: file.file_path,
                            });

                            if (!signedUrl) {
                              toast({
                                title: "Error",
                                description: "Failed to load file" + (error?.message ? ": " + error.message : ""),
                                variant: "destructive",
                              });
                              return;
                            }
                            try {
                              const response = await fetch(signedUrl);
                              if (!response.ok) throw new Error("Failed to fetch file");
                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              const newWindow = window.open(blobUrl, "_blank");
                              setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                              if (!newWindow) {
                                toast({
                                  title: "Popup Blocked",
                                  description: "Please allow popups for this site",
                                  variant: "destructive",
                                });
                              }
                            } catch (err) {
                              console.error("Error opening file:", err);
                              toast({
                                title: "Error",
                                description: "Failed to open file",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(file.file_category === "POD" || file.file_category === "ADDITIONAL") && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEnhanceDialog(file)}
                                >
                                  <ScanLine className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Enhance document</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={async () => {
                            const { signedUrl, error } = await getOrderFileSignedUrl({
                              id: file.id,
                              order_id: (file as any).order_id,
                              file_category: file.file_category,
                              file_name: file.file_name,
                              file_path: file.file_path,
                            });

                            if (!signedUrl) {
                              toast({
                                title: "Error",
                                description: "Failed to load file" + (error?.message ? ": " + error.message : ""),
                                variant: "destructive",
                              });
                              return;
                            }
                            try {
                              const response = await fetch(signedUrl);
                              if (!response.ok) throw new Error("Failed to fetch file");
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = file.file_name;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                            } catch (err) {
                              console.error("Error downloading file:", err);
                              toast({
                                title: "Error",
                                description: "Failed to download file",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            setFilesToDelete((prev) => [...prev, file.id]);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {filesToDelete.length > 0 && (
              <div className="p-4 border border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {filesToDelete.length} file(s) marked for deletion
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Files will be permanently deleted when you update the order
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFilesToDelete([])}>
                    Undo All
                  </Button>
                </div>
              </div>
            )}

            {/* Driver-specific Pickup/Delivery Times for Load Confirmation */}

            {/* Generate Load Confirmation Button */}
            <div className="flex justify-center mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateConfirmation}
                disabled={isGeneratingConfirmation || !truck || !driver1 || pickupsDrops.length < 2}
                className="w-full max-w-md"
              >
                {isGeneratingConfirmation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <FileText className="mr-2 h-4 w-4" />
                Generate Load Confirmation
              </Button>
            </div>

            {/* Email to Driver Section */}
            <Card className="bg-blue-50/30 border-blue-200 mt-6">
              <CardHeader>
                <CardTitle className="text-base">Email to Driver</CardTitle>
                <p className="text-sm text-muted-foreground">Upload a file to send to the driver via email</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Card
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-md",
                    dragStates.email && "border-blue-400 bg-blue-50/50 scale-[1.02]",
                  )}
                  {...emailDragHandlers}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-blue-700 flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Load Confirmation File
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dragStates.email ? (
                      <div className="border-2 border-dashed border-blue-400 rounded-lg p-4 text-center bg-blue-50">
                        <FileText className="mx-auto h-6 w-6 text-blue-500 mb-1" />
                        <p className="text-xs text-blue-600 font-medium">Drop file here</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-blue-600 mb-2">
                          {emailFiles.length > 0 ? `${emailFiles.length} file(s) selected` : "Click or drag file here"}
                        </p>
                        {emailFiles.length > 0 && (
                          <div className="space-y-1 mb-2">
                            {emailFiles.map((file, index) => (
                              <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                                <FileText className="h-3 w-3" />
                                <span className="truncate">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <input
                      ref={emailFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          const selected = Array.from(e.target.files);
                          // Block files that match RC uploads (new or existing)
                          const rcNewNames = new Set(rcFiles ? Array.from(rcFiles).map((f) => f.name) : []);
                          const rcExistingNames = new Set(
                            existingFiles.filter((f) => f.file_category === "RC").map((f) => f.file_name),
                          );
                          const filtered = selected.filter(
                            (f) => !rcNewNames.has(f.name) && !rcExistingNames.has(f.name),
                          );
                          if (filtered.length < selected.length) {
                            toast({
                              title: "Duplicate file skipped",
                              description: "Files already uploaded as RC cannot be used for email to driver.",
                              variant: "destructive",
                            });
                          }
                          setEmailFiles(filtered);
                        }
                      }}
                      className="hidden"
                    />
                    <p className="text-xs text-blue-600">Upload the load confirmation to email to driver</p>
                  </CardContent>
                </Card>

                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendEmailToDriver}
                    disabled={isSendingEmail || emailSent || emailFiles.length === 0}
                    className="w-full max-w-md"
                  >
                    {isSendingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {emailSent ? (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Email Sent ✓
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Email to Driver
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center">
              <div>
                {(truck || driver1) && !isLocked && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      setYardDialogOpen(true);
                      setYardOriginalMiles("");
                      setYardRecoveryMiles("");
                      setOriginalDriverPrice("");

                      // Calculate miles automatically
                      const pickupsList = pickupsDrops.filter((pd) => pd.type === "pickup");
                      const deliveriesList = pickupsDrops.filter((pd) => pd.type === "delivery");
                      const firstPickup = pickupsList[0];
                      const lastDelivery = deliveriesList[deliveriesList.length - 1];

                      if (
                        firstPickup?.latitude &&
                        firstPickup?.longitude &&
                        lastDelivery?.latitude &&
                        lastDelivery?.longitude
                      ) {
                        setYardMilesLoading(true);
                        try {
                          const { data: milesData } = await supabase.functions.invoke("calculate-yard-transfer-miles", {
                            body: {
                              pickupLat: firstPickup.latitude,
                              pickupLon: firstPickup.longitude,
                              deliveryLat: lastDelivery.latitude,
                              deliveryLon: lastDelivery.longitude,
                            },
                          });
                          if (milesData) {
                            setYardOriginalMiles(milesData.originalMiles?.toString() || "");
                            setYardRecoveryMiles(milesData.recoveryMiles?.toString() || "");
                          }
                        } catch (err) {
                          console.error("Error calculating miles:", err);
                        } finally {
                          setYardMilesLoading(false);
                        }
                      }
                    }}
                  >
                    <Warehouse className="h-4 w-4 mr-2" />
                    Left Trailer at the Yard
                  </Button>
                )}
              </div>
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const shouldReturnToYardLoads = localStorage.getItem("returnToYardLoads") === "true";
                    const shouldReturnToOrders = localStorage.getItem("returnToOrders") === "true";

                    if (returnToReports) {
                      localStorage.removeItem("returnToReports");
                      navigate("/reports");
                      window.scrollTo(0, 0);
                    } else if (returnToTrips) {
                      localStorage.removeItem("returnToTrips");
                      navigate("/trips");
                      window.scrollTo(0, 0);
                    } else if (shouldReturnToYardLoads) {
                      localStorage.removeItem("returnToYardLoads");
                      navigate("/yard-loads");
                      window.scrollTo(0, 0);
                    } else if (shouldReturnToOrders) {
                      navigate("/orders");
                      window.scrollTo(0, 0);
                    } else if (shouldReturnToOrders) {
                      navigate("/orders");
                      window.scrollTo(0, 0);
                    } else {
                      navigate("/orders");
                    }
                  }}
                >
                  Cancel
                </Button>
                {(hasRole("manager") || hasRole("supervisor") || hasRole("admin") || hasRole("dispatch")) &&
                  !isRecovery &&
                  !isLocked && (
                    <Button type="button" variant="secondary" onClick={() => setRecoveryDialogOpen(true)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Transfer Load
                    </Button>
                  )}
                {/* Add Transfer button for orders that already have transfers */}
                {(hasRole("manager") || hasRole("supervisor") || hasRole("admin") || hasRole("dispatch")) &&
                  isRecovery &&
                  !isLocked && (
                    <Button type="button" variant="outline" onClick={() => setAddTransferDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Transfer
                    </Button>
                  )}
                {(hasRole("manager") || hasRole("supervisor") || hasRole("admin")) && isRecovery && !isLocked && (
                  <Button type="button" variant="destructive" onClick={handleRevertTransfer}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Revert Transfer
                  </Button>
                )}
                <Button type="submit" disabled={isSubmitting || isLocked}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Order"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <RecoveryLoadDialog
        open={recoveryDialogOpen}
        onOpenChange={setRecoveryDialogOpen}
        onSave={handleRecoverySave}
        currentDriver={originalDriverName || drivers?.find((d) => d.id === driver1)?.name || "N/A"}
        currentDriverId={driver1}
        currentTruck={originalTruckNumber || trucks?.find((t) => t.id === truck)?.truck_number || "N/A"}
        currentTrailer={originalTrailerNumber || trailer || "N/A"}
        currentTrailerId={trailerId}
        totalMiles={parseInt(loadedMiles) || 0}
        totalDriverRate={parseFloat(driverPrice) || 0}
      />

      <AddTransferDialog
        open={addTransferDialogOpen}
        onOpenChange={setAddTransferDialogOpen}
        onSave={handleAddTransfer}
        previousTransfer={
          orderTransfers.length > 0
            ? {
                driverName:
                  orderTransfers[orderTransfers.length - 1]?.driver1?.name ||
                  orderTransfers[orderTransfers.length - 1]?.manual_driver_name ||
                  "N/A",
                truckNumber:
                  orderTransfers[orderTransfers.length - 1]?.truck?.truck_number ||
                  orderTransfers[orderTransfers.length - 1]?.manual_truck_number ||
                  "N/A",
                trailerNumber:
                  orderTransfers[orderTransfers.length - 1]?.trailer?.trailer_number ||
                  orderTransfers[orderTransfers.length - 1]?.manual_trailer_number ||
                  "N/A",
                miles: orderTransfers[orderTransfers.length - 1]?.miles || 0,
                driverPrice: orderTransfers[orderTransfers.length - 1]?.driver_price || 0,
              }
            : {
                driverName: drivers?.find((d) => d.id === driver1)?.name || "N/A",
                truckNumber: trucks?.find((t) => t.id === truck)?.truck_number || "N/A",
                trailerNumber: trailers?.find((t) => t.id === trailerId)?.trailer_number || "N/A",
                miles: parseInt(recoveryMiles) || 0,
                driverPrice: parseFloat(recoveryDriverPrice) || 0,
              }
        }
        sequenceNumber={orderTransfers.length > 0 ? Math.max(...orderTransfers.map((t) => t.sequence_number)) + 1 : 2}
      />

      {/* Yard Dialog */}
      <Dialog open={yardDialogOpen} onOpenChange={setYardDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Left Trailer at the Yard</DialogTitle>
            <DialogDescription>
              This will clear the driver and truck assignments from this load and create a transfer record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Original Assignment Info */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <h4 className="font-semibold text-sm">Original Assignment</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Driver: </span>
                  <span>{drivers?.find((d) => d.id === driver1)?.name || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Truck: </span>
                  <span>{trucks?.find((t) => t.id === truck)?.truck_number || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Trailer: </span>
                  <span>{trailer || "N/A"}</span>
                </div>
              </div>
            </div>

            {/* Miles Inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="yardOriginalMilesInput">Miles to Terminal (Original)</Label>
                <Input
                  id="yardOriginalMilesInput"
                  type="number"
                  placeholder={yardMilesLoading ? "Calculating..." : "Enter miles"}
                  value={yardOriginalMiles}
                  onChange={(e) => setYardOriginalMiles(e.target.value)}
                  disabled={yardMilesLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yardRecoveryMilesInput">Miles to Delivery (Recovery)</Label>
                <Input
                  id="yardRecoveryMilesInput"
                  type="number"
                  placeholder={yardMilesLoading ? "Calculating..." : "Enter miles"}
                  value={yardRecoveryMiles}
                  onChange={(e) => setYardRecoveryMiles(e.target.value)}
                  disabled={yardMilesLoading}
                />
              </div>
            </div>

            {/* Original Driver Rate */}
            <div className="space-y-2">
              <Label htmlFor="originalDriverRateInput">
                Original Stop Amt ($) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="originalDriverRateInput"
                type="number"
                placeholder="Enter original stop amt"
                value={originalDriverPrice}
                onChange={(e) => setOriginalDriverPrice(e.target.value)}
              />
            </div>

            {/* BOL Location */}
            <div className="space-y-2">
              <Label htmlFor="yardBolLocationInput">
                BOL Location <span className="text-destructive">*</span>
              </Label>
              <Input
                id="yardBolLocationInput"
                placeholder="e.g. In the trailer, office, driver has it..."
                value={yardBolLocation}
                onChange={(e) => setYardBolLocation(e.target.value)}
              />
            </div>

            {/* Reason for leaving at yard - MANDATORY */}
            <div className="space-y-2">
              <Label htmlFor="yardReasonInput">
                Reason for Leaving at Yard <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="yardReasonInput"
                placeholder="Enter the reason why the trailer was left at the yard..."
                value={yardReason}
                onChange={(e) => setYardReason(e.target.value)}
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">This note will be added to the user notes for this order.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setYardDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLeftAtYard}
              disabled={!yardReason.trim() || !yardBolLocation.trim() || !originalDriverPrice}
            >
              Confirm Left at Yard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transfer Dialog */}
      {editingTransfer && (
        <EditTransferDialog
          open={editTransferDialogOpen}
          onOpenChange={setEditTransferDialogOpen}
          onSave={handleEditTransferSave}
          transfer={editingTransfer}
        />
      )}

      {/* Change Note Dialog */}
      <ChangeNoteDialog
        open={showChangeNoteDialog}
        onOpenChange={setShowChangeNoteDialog}
        changes={pendingChanges}
        onConfirm={handleChangeNoteConfirm}
        isSubmitting={isSubmitting}
      />

      {/* Document Scanner Dialog */}
      <DocumentScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onCapture={handleScanCapture}
        category={scannerCategory}
      />

      {/* Document Enhance Dialog */}
      <DocumentEnhanceDialog
        open={enhanceDialogOpen}
        onOpenChange={setEnhanceDialogOpen}
        onSave={handleEnhanceSave}
        fileUrl={enhanceFileUrl}
        fileName={enhanceFileName}
      />

      {/* Miles Change Reason Dialog */}
      <MilesChangeReasonDialog
        open={showMilesChangeDialog}
        onConfirm={async (reason) => {
          setShowMilesChangeDialog(false);
          // Send SMS notification
          const phoneNumbers = getMilesChangeSmsRecipients(profile?.office);
          if (phoneNumbers.length > 0 && milesChangeInfo) {
            const selectedDriver1 = drivers?.find((d) => d.id === driver1);
            const companyName =
              selectedDriver1?.company?.name || companies?.find((c) => c.id === selectedDriver1?.company_id)?.name;
            const ilnDisplay = formatInternalLoadNumber(internalLoadNumber, companyName);
            const message = buildMilesChangeSmsMessage({
              internalLoadNumber: ilnDisplay,
              brokerLoadNumber: brokerLoadNumber || "N/A",
              dhMilesChanged: milesChangeInfo.dhMilesChanged,
              loadedMilesChanged: milesChangeInfo.loadedMilesChanged,
              oldDh: milesChangeInfo.oldDhMiles,
              newDh: milesChangeInfo.newDhMiles,
              oldLoaded: milesChangeInfo.oldLoadedMiles,
              newLoaded: milesChangeInfo.newLoadedMiles,
              reason: reason,
              userName: profile?.full_name || "Unknown",
            });
            try {
              await supabase.functions.invoke("send-sms", {
                body: { message, phoneNumbers },
              });
            } catch (err) {
              console.error("Failed to send miles change SMS:", err);
            }
          }
          // Update baselines so check won't trigger again, then continue with submit
          setBaselineLoadedMiles(parseInt(loadedMiles) || 0);
          setBaselineDhMiles(parseInt(dhMiles) || 0);
          // Continue with the normal submit flow (detect changes etc.)
          const changes = detectChanges();
          if (changes.length > 0) {
            setPendingChanges(changes);
            setShowChangeNoteDialog(true);
            return;
          }
          setIsSubmitting(true);
          await performSave();
        }}
        changeInfo={
          milesChangeInfo || {
            dhMilesChanged: false,
            loadedMilesChanged: false,
            oldDhMiles: 0,
            newDhMiles: 0,
            oldLoadedMiles: 0,
            newLoadedMiles: 0,
          }
        }
      />
    </div>
  );
};
export default EditOrder;
