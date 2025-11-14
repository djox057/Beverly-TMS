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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Loader2, GripVertical, ArrowLeft, Sparkles, Upload, FileText, RefreshCw, Mail, Warehouse, Download, Eye } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { US_STATES } from "@/lib/constants";
import { useCompanies } from "@/hooks/useCompanies";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { parseAddress } from "@/utils/addressParser";
import { useToast } from "@/components/ui/use-toast";
import { useAuthContext } from "@/contexts/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { combineDateAndTime, parseSimpleDateTime } from "@/utils/dateUtils";
import { RecoveryLoadDialog, RecoveryData } from "@/components/RecoveryLoadDialog";
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
}
const EditOrder = () => {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    profile,
    hasRole
  } = useAuthContext();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnToReports, setReturnToReports] = useState(false);

  // Check on mount if we should return to reports
  useEffect(() => {
    const shouldReturnToReports = localStorage.getItem('returnToReports') === 'true';
    setReturnToReports(shouldReturnToReports);
  }, []);

  // Form states
  const [bookedByCompany, setBookedByCompany] = useState("");
  const [broker, setBroker] = useState("");
  const [truck, setTruck] = useState("");
  const [driver1, setDriver1] = useState("");
  const [driver2, setDriver2] = useState("");
  const [trailer, setTrailer] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [brokerLoadNumber, setBrokerLoadNumber] = useState("");
  const [pickupDateRange, setPickupDateRange] = useState<DateRange>();
  const [deliveryDateRange, setDeliveryDateRange] = useState<DateRange>();
  const [freightAmount, setFreightAmount] = useState("");
  const [detention, setDetention] = useState("");
  const [layover, setLayover] = useState("");
  const [extraStop, setExtraStop] = useState("");
  const [lumper, setLumper] = useState("");
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
    const escort = escortFeeBrokerPaid ? parseFloat(escortFee) || 0 : 0;
    const noTracking = parseFloat(noTrackingFee) || 0;
    const wrongAddr = parseFloat(wrongAddressFee) || 0;
    return base + det + lay + extra + lump - late + ton + escort - noTracking - wrongAddr;
  }, [freightAmount, detention, layover, extraStop, lumper, lateFee, tonu, escortFee, escortFeeBrokerPaid, noTrackingFee, wrongAddressFee]);
  const totalDriverPay = useMemo(() => {
    const base = parseFloat(driverPrice) || 0;
    const det = parseFloat(detentionDriver) || 0;
    const lay = parseFloat(layoverDriver) || 0;
    const late = parseFloat(lateFeeDriver) || 0;
    const ton = parseFloat(tonuDriver) || 0;
    const noTracking = parseFloat(noTrackingFeeDriver) || 0;
    const wrongAddr = parseFloat(wrongAddressFeeDriver) || 0;
    return base + det + lay - late + ton - noTracking - wrongAddr;
  }, [driverPrice, detentionDriver, layoverDriver, lateFeeDriver, tonuDriver, noTrackingFeeDriver, wrongAddressFeeDriver]);
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
  const [bookedBy, setBookedBy] = useState("");
  const [internalLoadNumber, setInternalLoadNumber] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isGeneratingConfirmation, setIsGeneratingConfirmation] = useState(false);
  const [yardDialogOpen, setYardDialogOpen] = useState(false);

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
  const [originalDriverName, setOriginalDriverName] = useState("");
  const [originalTruckNumber, setOriginalTruckNumber] = useState("");
  const [originalTrailerNumber, setOriginalTrailerNumber] = useState("");
  const [originalMiles, setOriginalMiles] = useState("");
  const [originalDriverPrice, setOriginalDriverPrice] = useState("");
  const [recoveryMiles, setRecoveryMiles] = useState("");
  const [recoveryDriverPrice, setRecoveryDriverPrice] = useState("");
  const [recoveryDate, setRecoveryDate] = useState("");

  // Handlers for numeric input validation
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
    email: false
  });

  // File input refs for programmatic access
  const rcFileInputRef = useRef<HTMLInputElement>(null);
  const bolFileInputRef = useRef<HTMLInputElement>(null);
  const podFileInputRef = useRef<HTMLInputElement>(null);
  const additionalFileInputRef = useRef<HTMLInputElement>(null);
  const emailFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch data from database
  const {
    data: companies
  } = useCompanies();
  const {
    data: trucks
  } = useTrucks();
  const {
    data: drivers
  } = useDrivers();
  const [profiles, setProfiles] = useState<Array<{
    id: string;
    full_name: string;
  }>>([]);

  // Company email configuration (same as NewOrder)
  const COMPANY_EMAIL_CONFIG: Record<string, {
    sender: string;
    cc: string;
  }> = {
    "BF Prime LLC": {
      sender: "BF Prime Dispatch <truckload@bfprime.net>",
      cc: "dispatch@bfprime.net"
    },
    "BF Prime United LLC": {
      sender: "BF Prime United Dispatch <truckload@bfprimeunited.net>",
      cc: "dispatch@bfprimeunited.net"
    },
    "Beverly Group": {
      sender: "Beverly Group Dispatch <truckload@beverlygroupllc.net>",
      cc: "dispatch@beverlygroupllc.net"
    },
    "Beverly group": {
      sender: "Beverly Group Dispatch <truckload@beverlygroupllc.net>",
      cc: "dispatch@beverlygroupllc.net"
    },
    "Beverly Freight": {
      sender: "Beverly Freight Dispatch <truckload@beverlyfreight.net>",
      cc: "dispatch@beverlyfreight.net"
    },
    "Beverly Freight Inc": {
      sender: "Beverly Freight Dispatch <truckload@beverlyfreight.net>",
      cc: "dispatch@beverlyfreight.net"
    },
    "BG Prime Inc": {
      sender: "BG Prime Dispatch <truckload@bgprime.net>",
      cc: "dispatch@bgprime.net"
    }
  };

  // Fetch profiles for booked by dropdown
  useEffect(() => {
    const fetchProfiles = async () => {
      const {
        data
      } = await supabase.from("profiles").select("id, full_name").not("full_name", "is", null).order("full_name");
      if (data) {
        setProfiles(data);
      }
    };
    fetchProfiles();
  }, []);

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
        variant: "destructive"
      });
        const shouldReturnToReports = localStorage.getItem('returnToReports') === 'true';
        const shouldReturnToYardLoads = localStorage.getItem('returnToYardLoads') === 'true';
        const shouldReturnToOrders = localStorage.getItem('returnToOrders') === 'true';
        if (shouldReturnToReports) {
          localStorage.removeItem('returnToReports');
          navigate("/reports");
        } else if (shouldReturnToYardLoads) {
          localStorage.removeItem('returnToYardLoads');
          navigate("/yard-loads");
        } else if (shouldReturnToOrders) {
          navigate("/orders");
        } else {
          navigate("/orders");
        }
      return;
    }
    try {
      const {
        data: orderData,
        error
      } = await supabase.from("orders").select(`
          *,
          pickup_drops!inner(*),
          order_files(*),
          trailer:trailers!trailer_id(trailer_number)
        `).eq("id", id).order("sequence_number", {
        foreignTable: "pickup_drops",
        ascending: true
      }).single();
      console.log("Order data response:", {
        orderData,
        error
      });
      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }
      if (orderData) {
        console.log("Setting form data with order:", orderData);

        // Check if order is locked and redirect if it is
        if (orderData.locked) {
          console.log("Load is locked, redirecting to loads page");
          toast({
            title: "Load Locked",
            description: "This load is locked and cannot be edited",
            variant: "destructive"
          });
          const shouldReturnToReports = localStorage.getItem('returnToReports') === 'true';
          const shouldReturnToYardLoads = localStorage.getItem('returnToYardLoads') === 'true';
          const shouldReturnToOrders = localStorage.getItem('returnToOrders') === 'true';
          if (shouldReturnToReports) {
            localStorage.removeItem('returnToReports');
            navigate("/reports");
          } else if (shouldReturnToYardLoads) {
            localStorage.removeItem('returnToYardLoads');
            navigate("/yard-loads");
          } else if (shouldReturnToOrders) {
            navigate("/orders");
          } else {
            navigate("/orders");
          }
          return;
        }
        setIsLocked(orderData.locked || false);
        setBookedByCompany(orderData.booked_by_company_id || "");
        setBroker(orderData.broker_id || "");
        setTruck(orderData.truck_id || "");
        setTrailer(orderData.trailer?.trailer_number || "");
        setTrailerId(orderData.trailer_id || "");
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
        setDetentionDriver((orderData as any).detention_driver > 0 ? (orderData as any).detention_driver.toString() : "");
        setLayoverDriver((orderData as any).layover_driver > 0 ? (orderData as any).layover_driver.toString() : "");
        setLateFeeDriver((orderData as any).late_fee_driver > 0 ? (orderData as any).late_fee_driver.toString() : "");
        setTonuDriver((orderData as any).tonu_driver > 0 ? (orderData as any).tonu_driver.toString() : "");
        setNoTrackingFee((orderData as any).no_tracking_fee?.toString() || "");
        setNoTrackingFeeDriver((orderData as any).no_tracking_fee_driver > 0 ? (orderData as any).no_tracking_fee_driver.toString() : "");
        setWrongAddressFee((orderData as any).wrong_address_fee?.toString() || "");
        setWrongAddressFeeDriver((orderData as any).wrong_address_fee_driver > 0 ? (orderData as any).wrong_address_fee_driver.toString() : "");
        setCommodity((orderData as any).commodity || "");
        setWeight((orderData as any).weight?.toString() || "");
        setReferenceNumber((orderData as any).reference_number || "");
        setPoNumber((orderData as any).po_number || "");
        setPuNumber((orderData as any).pu_number || "");
        setNotes(orderData.notes || "");
        setBookedBy(orderData.booked_by || "");
        setEscortFee((orderData as any).escort_fee?.toString() || "");
        setEscortFeeBrokerPaid((orderData as any).escort_fee_broker_paid || false);
        setInternalLoadNumber(orderData.internal_load_number?.toString() || "");

        // Check if any additional fields have values > 0 to auto-show them
        const hasAdditionalValues = (orderData as any).detention && parseFloat((orderData as any).detention) > 0 || (orderData as any).detention_driver && parseFloat((orderData as any).detention_driver) > 0 || (orderData as any).layover && parseFloat((orderData as any).layover) > 0 || (orderData as any).layover_driver && parseFloat((orderData as any).layover_driver) > 0 || (orderData as any).extra_stop && parseFloat((orderData as any).extra_stop) > 0 || (orderData as any).lumper && parseFloat((orderData as any).lumper) > 0 || (orderData as any).late_fee && parseFloat((orderData as any).late_fee) > 0 || (orderData as any).late_fee_driver && parseFloat((orderData as any).late_fee_driver) > 0 || (orderData as any).no_tracking_fee && parseFloat((orderData as any).no_tracking_fee) > 0 || (orderData as any).no_tracking_fee_driver && parseFloat((orderData as any).no_tracking_fee_driver) > 0 || (orderData as any).wrong_address_fee && parseFloat((orderData as any).wrong_address_fee) > 0 || (orderData as any).wrong_address_fee_driver && parseFloat((orderData as any).wrong_address_fee_driver) > 0 || (orderData as any).tonu && parseFloat((orderData as any).tonu) > 0 || (orderData as any).tonu_driver && parseFloat((orderData as any).tonu_driver) > 0 || (orderData as any).escort_fee && parseFloat((orderData as any).escort_fee) > 0;
        setShowAdditionalFields(hasAdditionalValues);

        // Load recovery state
        setIsRecovery((orderData as any).is_recovery || false);
        if ((orderData as any).is_recovery) {
          // Get original driver and truck info from database
          const {
            data: origDriver
          } = await supabase.from("drivers").select("name").eq("id", (orderData as any).original_driver1_id).maybeSingle();
          const {
            data: origTruck
          } = await supabase.from("trucks").select("truck_number").eq("id", (orderData as any).original_truck_id).maybeSingle();
          const {
            data: origTrailer
          } = await supabase.from("trailers").select("trailer_number").eq("id", (orderData as any).original_trailer_id).maybeSingle();
          setOriginalDriverName(origDriver?.name || "");
          setOriginalTruckNumber(origTruck?.truck_number || "");
          setOriginalTrailerNumber(origTrailer?.trailer_number || "");
          setOriginalMiles((orderData as any).original_miles?.toString() || "");
          setOriginalDriverPrice((orderData as any).original_driver_price?.toString() || "");
          setRecoveryMiles((orderData as any).recovery_miles?.toString() || "");
          setRecoveryDriverPrice((orderData as any).recovery_driver_price?.toString() || "");
          setRecoveryDate((orderData as any).recovery_date || "");
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
                to: dateObj
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
              delivery_end_datetime: orderData.delivery_end_datetime
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
              companyName: pd.company_name || ""
            };
          });

          // Deduplicate exact matches when loading
          const uniquePickupsDrops = transformedPickupsDrops.filter((item: any, index: number, self: any[]) => {
            return index === self.findIndex((t: any) => t.type === item.type && t.address === item.address && t.city === item.city && t.state === item.state && t.zipCode === item.zipCode && t.datetime === item.datetime);
          });
          setPickupsDrops(uniquePickupsDrops);
          console.log("Set pickupsDrops to:", uniquePickupsDrops);
        }

        // Load existing files
        if (orderData.order_files) {
          setExistingFiles(orderData.order_files);
        }
        console.log("Data loading completed successfully");
      }
    } catch (error) {
      console.error("Error loading order:", error);
      toast({
        title: "Error",
        description: "Failed to load order data",
        variant: "destructive"
      });
      const shouldReturnToReports = localStorage.getItem('returnToReports') === 'true';
      const shouldReturnToYardLoads = localStorage.getItem('returnToYardLoads') === 'true';
      const shouldReturnToOrders = localStorage.getItem('returnToOrders') === 'true';
      if (shouldReturnToReports) {
        localStorage.removeItem('returnToReports');
        navigate("/reports");
      } else if (shouldReturnToYardLoads) {
        localStorage.removeItem('returnToYardLoads');
        navigate("/yard-loads");
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
    const channel = supabase.channel(`order-${id}-changes`).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${id}`
    }, payload => {
      console.log('Order changed:', payload);
      loadOrderData();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'pickup_drops',
      filter: `order_id=eq.${id}`
    }, payload => {
      console.log('Pickup/drop changed:', payload);
      loadOrderData();
    }).subscribe();
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
          variant: "destructive"
        });
        const shouldReturnToReports = localStorage.getItem('returnToReports') === 'true';
        const shouldReturnToYardLoads = localStorage.getItem('returnToYardLoads') === 'true';
        const shouldReturnToOrders = localStorage.getItem('returnToOrders') === 'true';
        if (shouldReturnToReports) {
          localStorage.removeItem('returnToReports');
          navigate("/reports");
        } else if (shouldReturnToYardLoads) {
          localStorage.removeItem('returnToYardLoads');
          navigate("/yard-loads");
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
        variant: "destructive"
      });
      const shouldReturnToReports = localStorage.getItem('returnToReports') === 'true';
      const shouldReturnToYardLoads = localStorage.getItem('returnToYardLoads') === 'true';
      const shouldReturnToOrders = localStorage.getItem('returnToOrders') === 'true';
      if (shouldReturnToReports) {
        localStorage.removeItem('returnToReports');
        navigate("/reports");
      } else if (shouldReturnToYardLoads) {
        localStorage.removeItem('returnToYardLoads');
        navigate("/yard-loads");
      } else if (shouldReturnToOrders) {
        navigate("/orders");
      } else {
        navigate("/orders");
      }
    }
  }, [id, loadOrderData, navigate, toast]);
  const addPickupDrop = (type: "pickup" | "delivery") => {
    const newItem: PickupDrop = {
      id: Date.now().toString(),
      type,
      address: "",
      datetime: ""
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
    setPickupsDrops(pickupsDrops.filter(item => item.id !== id));
  };
  const updatePickupDrop = (id: string, field: keyof PickupDrop, value: any) => {
    setPickupsDrops(pickupsDrops.map(item => item.id === id ? {
      ...item,
      [field]: value
    } : item));
  };
  const updatePickupDropTime = (id: string, timeType: "startTime" | "endTime", time: string) => {
    setPickupsDrops(pickupsDrops.map(item => item.id === id ? {
      ...item,
      [timeType]: time
    } : item));
  };
  const updatePickupDropDateRange = (id: string, dateRange: DateRange | undefined) => {
    setPickupsDrops(pickupsDrops.map(item => item.id === id ? {
      ...item,
      dateRange
    } : item));
  };
  const handleExtractWithAI = async () => {
    if (!rcFiles || rcFiles.length === 0) {
      toast({
        title: "No RC File Selected",
        description: "Please select a PDF file in the RC section to extract data from.",
        variant: "destructive"
      });
      return;
    }
    const pdfFile = Array.from(rcFiles).find(file => file.type === "application/pdf");
    if (!pdfFile) {
      toast({
        title: "PDF Required",
        description: "Please select a PDF file for AI extraction.",
        variant: "destructive"
      });
      return;
    }
    setIsExtracting(true);
    try {
      console.log("Starting PDF extraction with OpenAI...");
      const formData = new FormData();
      formData.append("pdf", pdfFile);
      console.log("Calling extract-order-fields edge function...");
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      const response = await fetch(`https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/extract-order-fields`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM'}`
        },
        body: formData
      });
      console.log("Edge function response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Edge function error:", errorText);
        throw new Error(`Edge function failed with status ${response.status}`);
      }
      const data = await response.json();
      if (!data?.success) {
        console.error("Extraction failed:", data?.error);
        throw new Error(data?.error || "Failed to extract data");
      }
      const extractedData = data.data;
      console.log("Successfully extracted data:", extractedData);

      // Populate form fields with extracted data
      if (extractedData.brokerLoadNumber) {
        setBrokerLoadNumber(extractedData.brokerLoadNumber);
      }
      if (extractedData.freightAmount) {
        setFreightAmount(extractedData.freightAmount.toString());
      }
      if (extractedData.mileage) {
        setLoadedMiles(extractedData.mileage.toString());
      }

      // Handle date ranges from AI extraction - fix timezone offset
      if (extractedData.pickupStartDate && extractedData.pickupEndDate) {
        setPickupDateRange({
          from: new Date(extractedData.pickupStartDate + "T12:00:00"),
          to: new Date(extractedData.pickupEndDate + "T12:00:00")
        });
      } else if (extractedData.pickupDate) {
        const pickupDate = new Date(extractedData.pickupDate + "T12:00:00");
        setPickupDateRange({
          from: pickupDate,
          to: pickupDate
        });
      }
      if (extractedData.deliveryStartDate && extractedData.deliveryEndDate) {
        setDeliveryDateRange({
          from: new Date(extractedData.deliveryStartDate + "T12:00:00"),
          to: new Date(extractedData.deliveryEndDate + "T12:00:00")
        });
      } else if (extractedData.deliveryDate) {
        const deliveryDate = new Date(extractedData.deliveryDate + "T12:00:00");
        setDeliveryDateRange({
          from: deliveryDate,
          to: deliveryDate
        });
      }

      // Handle pickups and deliveries with date ranges
      const newPickupsDrops: PickupDrop[] = [];
      if (extractedData.pickupAddress) {
        const pickupDateRange = extractedData.pickupStartDate && extractedData.pickupEndDate ? {
          from: new Date(extractedData.pickupStartDate + "T12:00:00"),
          to: new Date(extractedData.pickupEndDate + "T12:00:00")
        } : extractedData.pickupDate ? {
          from: new Date(extractedData.pickupDate + "T12:00:00"),
          to: new Date(extractedData.pickupDate + "T12:00:00")
        } : undefined;
        newPickupsDrops.push({
          id: "pickup-1",
          type: "pickup",
          address: extractedData.pickupAddress,
          city: extractedData.pickupCity || "",
          state: extractedData.pickupState || "",
          zipCode: extractedData.pickupZip || "",
          datetime: extractedData.pickupDate || "",
          dateRange: pickupDateRange,
          startTime: extractedData.pickupStartTime || extractedData.pickupTime || "",
          endTime: extractedData.pickupEndTime || extractedData.pickupTime || ""
        });
      }
      if (extractedData.deliveryAddress) {
        const deliveryDateRange = extractedData.deliveryStartDate && extractedData.deliveryEndDate ? {
          from: new Date(extractedData.deliveryStartDate + "T12:00:00"),
          to: new Date(extractedData.deliveryEndDate + "T12:00:00")
        } : extractedData.deliveryDate ? {
          from: new Date(extractedData.deliveryDate + "T12:00:00"),
          to: new Date(extractedData.deliveryDate + "T12:00:00")
        } : undefined;
        newPickupsDrops.push({
          id: "delivery-1",
          type: "delivery",
          address: extractedData.deliveryAddress,
          city: extractedData.deliveryCity || "",
          state: extractedData.deliveryState || "",
          zipCode: extractedData.deliveryZip || "",
          datetime: extractedData.deliveryDate || "",
          dateRange: deliveryDateRange,
          startTime: extractedData.deliveryStartTime || extractedData.deliveryTime || "",
          endTime: extractedData.deliveryEndTime || extractedData.deliveryTime || ""
        });
      }
      if (newPickupsDrops.length > 0) {
        setPickupsDrops(newPickupsDrops);
      }
      toast({
        title: "Data Extracted Successfully",
        description: `Extracted ${data.fieldsExtracted} fields from PDF. Please review and adjust as needed.`
      });
    } catch (error: any) {
      console.error("Extraction error:", error);
      toast({
        title: "Extraction Failed",
        description: error.message || "Failed to extract data from PDF",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // Build email subject line (same as NewOrder)
  const buildEmailSubject = (): string => {
    const selectedTruck = trucks?.find(t => t.id === truck);
    const selectedDriver = drivers?.find(d => d.id === driver1);
    const pickups = pickupsDrops.filter(p => p.type === "pickup");
    const deliveries = pickupsDrops.filter(p => p.type === "delivery");
    const truckNumber = selectedTruck?.truck_number || "TBD";
    const driverFirstName = selectedDriver?.name?.split(" ")[0] || "Driver";
    const pickupDate = pickups[0]?.dateRange?.from ? `${String(pickups[0].dateRange.from.getMonth() + 1).padStart(2, "0")}/${String(pickups[0].dateRange.from.getDate()).padStart(2, "0")}/${pickups[0].dateRange.from.getFullYear()}` : "TBD";
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
        variant: "destructive"
      });
      return;
    }
    if (emailSent) return;
    try {
      setIsSendingEmail(true);
      const selectedDriver = drivers?.find(d => d.id === driver1);
      if (!selectedDriver?.email) {
        throw new Error("Driver email not found. Please ensure the driver has an email address.");
      }
      const selectedTruck = trucks?.find(t => t.id === truck);
      const companyName = selectedTruck?.company?.name;
      if (!companyName) {
        throw new Error("Truck company not found. Cannot determine sender email.");
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
              data: {
                session
              }
            } = await supabase.auth.getSession();
            const response = await fetch("https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-load-confirmation-email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}`
              },
              body: JSON.stringify({
                to: selectedDriver.email,
                from: emailConfig.sender,
                cc: emailConfig.cc,
                subject: subject,
                bodyText: "Please see the rate confirmation attached below.",
                attachmentBase64: base64Content,
                attachmentFilename: emailFiles[0].name,
                attachmentContentType: emailFiles[0].type
              })
            });
            const responseData = await response.json();
            if (!response.ok) {
              throw new Error(responseData.error || "Failed to send email");
            }
            setEmailSent(true);
            toast({
              title: "Email Sent",
              description: `File sent to ${selectedDriver.email}`
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
        variant: "destructive"
      });
    } finally {
      setIsSendingEmail(false);
    }
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
        description: "Please fill in company, truck, driver, pickup and delivery information before generating confirmation.",
        variant: "destructive"
      });
      return;
    }
    setIsGeneratingConfirmation(true);
    try {
      const selectedTruck = trucks?.find(t => t.id === truck);
      const selectedDriver = drivers?.find(d => d.id === driver1);

      // Get all pickups and deliveries
      const pickups = pickupsDrops.filter(p => p.type === "pickup");
      const deliveries = pickupsDrops.filter(p => p.type === "delivery");
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
      const formatLocationData = (location: any, driverDateRange?: DateRange, driverStartTime?: string, driverEndTime?: string) => ({
        address: location.address,
        cityStateZip: `${location.city || ''}${location.city && location.state ? ', ' : ''}${location.state || ''}${(location.city || location.state) && location.zipCode ? ' ' : ''}${location.zipCode || ''}`.trim(),
        date: formatDate(driverDateRange || location.dateRange),
        time: formatTime(driverStartTime || location.startTime) + (driverEndTime || location.endTime ? ` - ${formatTime(driverEndTime || location.endTime)}` : "")
      });

      // Build confirmation data with all pickups and deliveries
      const confirmationData: any = {
        brokerLoadNumber: brokerLoadNumber || "TBD",
        driverName: selectedDriver.name,
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
        pickupCityStateZip: formatLocationData(pickups[0], driverPickupDateRange, driverPickupStartTime, driverPickupEndTime).cityStateZip,
        pickupDate: formatLocationData(pickups[0], driverPickupDateRange, driverPickupStartTime, driverPickupEndTime).date,
        pickupTime: formatLocationData(pickups[0], driverPickupDateRange, driverPickupStartTime, driverPickupEndTime).time,
        pickupPuNumber: "",
        pickupPoNumber: ""
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
      const delivery1Data = formatLocationData(deliveries[0], driverDeliveryDateRange, driverDeliveryStartTime, driverDeliveryEndTime);
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
        data: {
          session
        }
      } = await supabase.auth.getSession();
      const response = await fetch(`https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/generate-load-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}`
        },
        body: JSON.stringify(confirmationData)
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
        description: "Load confirmation PDF has been generated and downloaded."
      });
    } catch (error: any) {
      console.error("Confirmation generation error:", error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate load confirmation",
        variant: "destructive"
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
      email: setEmailFiles
    }[fileType];
    const fileInputRef = {
      rc: rcFileInputRef,
      bol: bolFileInputRef,
      pod: podFileInputRef,
      additional: additionalFileInputRef,
      email: emailFileInputRef
    }[fileType];
    return {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragStates(prev => ({
          ...prev,
          [fileType]: true
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
          setDragStates(prev => ({
            ...prev,
            [fileType]: false
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
        setDragStates(prev => ({
          ...prev,
          [fileType]: false
        }));
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          // Convert FileList to File[] for email type, otherwise use FileList
          if (fileType === "email") {
            (setFiles as React.Dispatch<React.SetStateAction<File[]>>)(Array.from(files));
          } else {
            (setFiles as React.Dispatch<React.SetStateAction<FileList>>)(files);
          }
        }
      }
    };
  };

  // Click handler for file upload cards
  const handleCardClick = (fileType: "rc" | "bol" | "pod" | "additional") => (e: React.MouseEvent) => {
    console.log(`[DEBUG] Card clicked for ${fileType}`);

    // Don't trigger if clicking on the Extract with AI button
    if (fileType === "rc" && (e.target as HTMLElement).closest("button[data-ai-extract]")) {
      console.log("[DEBUG] Clicked on Extract AI button, skipping file input");
      return;
    }

    // Don't trigger if clicking on view/delete buttons
    if ((e.target as HTMLElement).closest("button")) {
      console.log("[DEBUG] Clicked on a button, skipping file input");
      return;
    }
    const fileInputRef = {
      rc: rcFileInputRef,
      bol: bolFileInputRef,
      pod: podFileInputRef,
      additional: additionalFileInputRef
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
  const companyOptions = companies?.map(company => ({
    value: company.id,
    label: company.name
  })) || [];
  const truckOptions = trucks?.map(truck => ({
    value: truck.id,
    label: truck.truck_number
  })) || [];
  const driverOptions = drivers?.map(driver => ({
    value: driver.id,
    label: driver.name
  })) || [];
  const handleRecoverySave = async (data: RecoveryData) => {
    try {
      // Update order with transfer information
      const {
        error
      } = await supabase.from("orders").update({
        is_recovery: true,
        original_driver1_id: driver1,
        original_driver2_id: driver2 || null,
        original_truck_id: truck,
        original_trailer_id: trailerId || null,
        original_miles: data.originalMiles,
        original_driver_price: data.originalDriverRate,
        recovery_miles: data.recoveryMiles,
        recovery_driver_price: data.recoveryDriverRate,
        recovery_date: data.recoveryDate,
        // Update current assignment to transfer driver
        truck_id: data.recoveryTruckId,
        trailer_id: data.recoveryTrailerId || null,
        driver1_id: data.recoveryDriverId,
        driver2_id: null
      }).eq("id", id);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Load marked as transfer successfully"
      });

      // Reload order data to reflect changes
      await loadOrderData();
    } catch (error: any) {
      console.error("Error saving transfer load:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to mark load as transfer",
        variant: "destructive"
      });
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log("Form submission already in progress, ignoring duplicate submission");
      return;
    }
    setIsSubmitting(true);
    try {
      // Update order - Calculate pickup/delivery datetimes from stops
      const allPickups = pickupsDrops.filter(item => item.type === "pickup");
      const allDeliveries = pickupsDrops.filter(item => item.type === "delivery");
      const firstPickup = allPickups[0];
      const lastPickup = allPickups[allPickups.length - 1];
      const firstDelivery = allDeliveries[0];
      const lastDelivery = allDeliveries[allDeliveries.length - 1];

      // Calculate new delivery datetime for comparison
      const newDeliveryDatetime = firstDelivery?.dateRange?.from && firstDelivery?.startTime ? combineDateAndTime(firstDelivery.dateRange.from, firstDelivery.startTime) : null;

      // Check if delivery date changed (date only, not time) and append to date change notes
      let updatedDateChangeNotes = dateChangeNotes;
      let dateWasChanged = false;
      if (originalDeliveryDate && newDeliveryDatetime) {
        const originalDateOnly = new Date(originalDeliveryDate.getFullYear(), originalDeliveryDate.getMonth(), originalDeliveryDate.getDate());
        const newDateOnly = new Date(newDeliveryDatetime);
        const newDateOnlyNormalized = new Date(newDateOnly.getFullYear(), newDateOnly.getMonth(), newDateOnly.getDate());

        // Only add note if the dates are different (ignoring time)
        if (originalDateOnly.getTime() !== newDateOnlyNormalized.getTime()) {
          const oldDateStr = originalDeliveryDate.toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric"
          });
          const changeNote = `Supposed to deliver on ${oldDateStr}`;
          updatedDateChangeNotes = dateChangeNotes ? `${dateChangeNotes}\n${changeNote}` : changeNote;
          dateWasChanged = true;
        }
      }
      
      // Get company from selected truck or driver (driver1), or preserve existing
      const selectedTruck = trucks?.find(t => t.id === truck);
      const selectedDriver1 = drivers?.find(d => d.id === driver1);
      const companyId = selectedTruck?.company_id || selectedDriver1?.company_id;
      
      const updateData: any = {
        broker_load_number: brokerLoadNumber || null,
        booked_by_company_id: bookedByCompany || null,
        broker_id: broker || null,
        truck_id: truck || null,
        trailer_id: truck && trucks ? trucks.find(t => t.id === truck)?.trailer_id || null : null,
        driver1_id: driver1 || null,
        driver2_id: driver2 || null,
        pickup_datetime: firstPickup?.dateRange?.from && firstPickup?.startTime ? combineDateAndTime(firstPickup.dateRange.from, firstPickup.startTime) : null,
        pickup_end_datetime: lastPickup?.dateRange?.from && lastPickup?.endTime ? combineDateAndTime(lastPickup.dateRange.from, lastPickup.endTime) : null,
        delivery_datetime: firstDelivery?.dateRange?.from && firstDelivery?.startTime ? combineDateAndTime(firstDelivery.dateRange.from, firstDelivery.startTime) : null,
        delivery_end_datetime: lastDelivery?.dateRange?.from && lastDelivery?.endTime ? combineDateAndTime(lastDelivery.dateRange.from, lastDelivery.endTime) : null,
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
        loaded_miles: loadedMiles ? parseInt(loadedMiles) : null,
        dh_miles: dhMiles ? parseInt(dhMiles) : null,
        mileage: (parseInt(loadedMiles) || 0) + (parseInt(dhMiles) || 0) || null,
        commodity: commodity || null,
        weight: weight ? parseFloat(weight) : null,
        reference_number: referenceNumber || null,
        po_number: poNumber || null,
        pu_number: puNumber || null,
        notes: notes || null,
        booked_by: bookedBy || null,
        escort_fee: escortFee ? parseFloat(escortFee) : null,
        escort_fee_broker_paid: escortFeeBrokerPaid,
        date_change_notes: updatedDateChangeNotes || null,
        canceled: Boolean(tonu && parseFloat(tonu) > 0),
        locked: Boolean(tonu && parseFloat(tonu) > 0) || isLocked
      };
      
      // Only update company_id if we have a new one, otherwise preserve existing
      if (companyId) {
        updateData.company_id = companyId;
      }
      
      const {
        error: orderError
      } = await supabase.from("orders").update(updateData).eq("id", id);
      if (orderError) throw orderError;

      // Upload new files if any
      const allFiles = [{
        files: rcFiles,
        category: "RC"
      }, {
        files: bolFiles,
        category: "BOL"
      }, {
        files: podFiles,
        category: "POD"
      }, {
        files: additionalFiles,
        category: "ADDITIONAL"
      }];
      for (const {
        files,
        category
      } of allFiles) {
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = `${id}/${category}/${Date.now()}_${file.name}`;
            const {
              error: uploadError
            } = await supabase.storage.from("order-files").upload(fileName, file);
            if (uploadError) throw uploadError;

            // Save file metadata
            const {
              error: fileError
            } = await supabase.from("order_files").insert({
              order_id: id,
              file_name: file.name,
              file_path: fileName,
              file_size: file.size,
              content_type: file.type,
              file_category: category,
              uploaded_by: profile?.full_name || profile?.email || "Unknown User"
            });
            if (fileError) throw fileError;
          }
        }
      }
      
      // Delete files marked for deletion
      if (filesToDelete.length > 0) {
        const filesToDeleteData = existingFiles.filter(f => filesToDelete.includes(f.id));
        
        for (const file of filesToDeleteData) {
          // Delete from storage
          await supabase.storage.from("order-files").remove([file.file_path]);
          
          // Delete from database
          await supabase.from("order_files").delete().eq("id", file.id);
        }
        
        // Update local state
        setExistingFiles(existingFiles.filter(f => !filesToDelete.includes(f.id)));
        setFilesToDelete([]);
      }

      // Smart UPDATE/INSERT/DELETE to avoid unique constraint violations
      if (pickupsDrops.length > 0) {
        // Get existing pickup_drops with all details
        const {
          data: existingPickupDrops
        } = await supabase.from("pickup_drops").select("id, sequence_number").eq("order_id", id).order("sequence_number");
        const existing = existingPickupDrops || [];

        // Prepare pickup_drop data with proper sequence numbers
        const formPickupDrops = pickupsDrops.filter(item => item.address).map((item, index) => {
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

          // Parse address to extract street address only (use the 'address' field from database)
          return {
            order_id: id,
            type: item.type,
            address: item.address || "",
            city: item.city || null,
            state: item.state || null,
            zip_code: item.zipCode || null,
            company_name: (item as any).companyName || null,
            datetime: datetime ? `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, "0")}-${String(datetime.getDate()).padStart(2, "0")} ${String(datetime.getHours()).padStart(2, "0")}:${String(datetime.getMinutes()).padStart(2, "0")}:00` : null,
            end_datetime: endDatetime ? `${endDatetime.getFullYear()}-${String(endDatetime.getMonth() + 1).padStart(2, "0")}-${String(endDatetime.getDate()).padStart(2, "0")} ${String(endDatetime.getHours()).padStart(2, "0")}:${String(endDatetime.getMinutes()).padStart(2, "0")}:00` : null,
            sequence_number: index + 1,
            contact_name: item.contactName || null,
            contact_phone: item.contactPhone || null,
            special_instructions: item.specialInstructions || null
          };
        });

        // Update existing pickup_drops (match by sequence number)
        for (let i = 0; i < Math.min(existing.length, formPickupDrops.length); i++) {
          const {
            error: updateError
          } = await supabase.from("pickup_drops").update(formPickupDrops[i]).eq("id", existing[i].id);
          if (updateError) throw updateError;
        }

        // Insert new pickup_drops if form has more than existing
        if (formPickupDrops.length > existing.length) {
          const newPickupDrops = formPickupDrops.slice(existing.length);
          const {
            error: insertError
          } = await supabase.from("pickup_drops").insert(newPickupDrops);
          if (insertError) throw insertError;
        }

        // Delete extra pickup_drops if existing has more than form
        if (existing.length > formPickupDrops.length) {
          const idsToDelete = existing.slice(formPickupDrops.length).map(pd => pd.id);
          const {
            error: deleteError
          } = await supabase.from("pickup_drops").delete().in("id", idsToDelete);
          if (deleteError) throw deleteError;
        }
      }
      toast({
        title: "Success",
        description: "Load updated successfully"
      });

      // Update original delivery date if it was changed to prevent duplicate notes
      if (dateWasChanged && newDeliveryDatetime) {
        setOriginalDeliveryDate(new Date(newDeliveryDatetime));
        setDateChangeNotes(updatedDateChangeNotes);
      }

      // Show success message
      toast({
        title: "Success",
        description: "Load updated successfully",
      });

      // Navigate back to where we came from
      const shouldReturnToYardLoads = localStorage.getItem('returnToYardLoads') === 'true';
      const shouldReturnToOrders = localStorage.getItem('returnToOrders') === 'true';
      if (returnToReports) {
        localStorage.removeItem('returnToReports');
        navigate("/reports");
        window.scrollTo(0, 0);
      } else if (shouldReturnToYardLoads) {
        localStorage.removeItem('returnToYardLoads');
        navigate("/yard-loads");
        window.scrollTo(0, 0);
      } else if (shouldReturnToOrders) {
        navigate("/orders");
        window.scrollTo(0, 0);
      } else {
        navigate("/orders");
      }
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "Error",
        description: "Failed to update load",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeftAtYard = async () => {
    if (!id) return;

    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          driver1_id: null,
          driver2_id: null,
          truck_id: null
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Trailer left at the yard. Driver and truck assignments cleared.",
      });

      setYardDialogOpen(false);
      
      // Navigate back to yard loads
      localStorage.setItem('returnToYardLoads', 'true');
      navigate('/yard-loads');
    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: "Error",
        description: "Failed to update load",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>;
  }
  return <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => {
              const shouldReturnToYardLoads = localStorage.getItem('returnToYardLoads') === 'true';
              const shouldReturnToOrders = localStorage.getItem('returnToOrders') === 'true';
              if (returnToReports) {
                localStorage.removeItem('returnToReports');
                navigate("/reports");
                window.scrollTo(0, 0);
              } else if (shouldReturnToYardLoads) {
                localStorage.removeItem('returnToYardLoads');
                navigate("/yard-loads");
                window.scrollTo(0, 0);
              } else if (shouldReturnToOrders) {
                navigate("/orders");
                window.scrollTo(0, 0);
              } else {
                navigate("/orders");
              }
            }}>
                 <ArrowLeft className="h-4 w-4 mr-2" />
                 {returnToReports ? 'Back to Reports' : localStorage.getItem('returnToYardLoads') === 'true' ? 'Back to Yard Loads' : 'Back to Orders'}
               </Button>
               <CardTitle className="text-2xl font-semibold">Edit Load</CardTitle>
             </div>
             <div className="text-right">
               <div className="text-sm text-muted-foreground">Internal Load #</div>
               <div className="text-lg font-medium">{internalLoadNumber}</div>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="broker-load-number">Broker Load #</Label>
              <Input id="broker-load-number" placeholder="Broker load number" value={brokerLoadNumber} onChange={e => setBrokerLoadNumber(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company">Booked by Company</Label>
                <Combobox options={companyOptions} value={bookedByCompany} onValueChange={setBookedByCompany} placeholder="Select company" searchPlaceholder="Search companies..." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="broker">Broker</Label>
                <BrokerCombobox value={broker} onValueChange={setBroker} placeholder="Select broker" searchPlaceholder="Search brokers..." />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="truck">Truck #</Label>
                <Combobox options={truckOptions} value={truck} onValueChange={setTruck} placeholder="Select truck" searchPlaceholder="Search trucks..." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailer">Trailer #</Label>
                <Input id="trailer" placeholder="Trailer number" value={trailer} onChange={e => setTrailer(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="driver1">Driver 1</Label>
                <Combobox options={driverOptions} value={driver1} onValueChange={setDriver1} placeholder="Select primary driver" searchPlaceholder="Search drivers..." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver2">Driver 2 (Optional)</Label>
                <Combobox options={[{
                value: "none",
                label: "None"
              }, ...driverOptions]} value={driver2 || "none"} onValueChange={value => setDriver2(value === "none" ? "" : value)} placeholder="Select second driver" searchPlaceholder="Search drivers..." />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Pickups & Deliveries</Label>
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
              </div>

              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="pickups-drops">
                  {provided => <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                      {[...pickupsDrops].sort((a, b) => {
                    // Sort pickups before deliveries
                    if (a.type === "pickup" && b.type === "delivery") return -1;
                    if (a.type === "delivery" && b.type === "pickup") return 1;
                    return 0;
                  }).map((item, index) => <Draggable key={item.id} draggableId={item.id} index={index}>
                            {(provided, snapshot) => <Card ref={provided.innerRef} {...provided.draggableProps} className={cn("p-4", snapshot.isDragging && "shadow-lg")}>
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <div {...provided.dragHandleProps}>
                                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                                    </div>
                                    <h4 className="font-medium capitalize">{item.type}</h4>
                                  </div>
                                  <Button type="button" variant="outline" size="sm" onClick={() => removePickupDrop(item.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                  <div className="space-y-1">
                                    <Label htmlFor={`company-name-${item.id}`}>
                                      {item.type === "pickup" ? "Shipper Name" : "Receiver Name"}
                                    </Label>
                                    <Input id={`company-name-${item.id}`} placeholder={item.type === "pickup" ? "Shipper company name" : "Receiver company name"} value={item.companyName || ""} onChange={e => {
                            const updated = pickupsDrops.map(p => p.id === item.id ? {
                              ...p,
                              companyName: e.target.value
                            } : p);
                            setPickupsDrops(updated);
                          }} />
                                  </div>

                                  <div className="space-y-1">
                                    <Label htmlFor={`address-${item.id}`}>Street Address</Label>
                                    <Input id={`address-${item.id}`} placeholder="123 Main St" value={item.address} onChange={e => updatePickupDrop(item.id, "address", e.target.value)} />
                                  </div>
                                  
                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="space-y-1 col-span-1">
                                      <Label htmlFor={`city-${item.id}`}>City</Label>
                                      <Input id={`city-${item.id}`} placeholder="City" value={item.city || ""} onChange={e => updatePickupDrop(item.id, "city", e.target.value)} />
                                    </div>
                                    
                                    <div className="space-y-1">
                                      <Label htmlFor={`state-${item.id}`}>State</Label>
                                      <Select value={item.state || ""} onValueChange={value => updatePickupDrop(item.id, "state", value)}>
                                        <SelectTrigger id={`state-${item.id}`}>
                                          <SelectValue placeholder="ST" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {US_STATES.map(state => <SelectItem key={state.value} value={state.value}>
                                              {state.value}
                                            </SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    
                                    <div className="space-y-1">
                                      <Label htmlFor={`zip-${item.id}`}>Zip Code</Label>
                                      <Input id={`zip-${item.id}`} placeholder="12345" value={item.zipCode || ""} onChange={e => {
                              // Only allow numbers and limit to 10 characters (for 12345-6789 format)
                              const value = e.target.value.replace(/[^\d-]/g, '').slice(0, 10);
                              updatePickupDrop(item.id, "zipCode", value);
                            }} maxLength={10} />
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <Label htmlFor={`daterange-${item.id}`}>Date & Time Range</Label>
                                    <DateTimeRangePicker date={item.dateRange} onDateChange={dateRange => updatePickupDropDateRange(item.id, dateRange)} startTime={item.startTime || ""} endTime={item.endTime || ""} onStartTimeChange={time => updatePickupDropTime(item.id, "startTime", time)} onEndTimeChange={time => updatePickupDropTime(item.id, "endTime", time)} placeholder={`Select ${item.type} date and time range`} />
                                  </div>

                                  {item.type === "delivery" && dateChangeNotes && <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                                      {dateChangeNotes}
                                    </div>}
                                </div>
                              </Card>}
                          </Draggable>)}
                      {provided.placeholder}
                    </div>}
                </Droppable>
              </DragDropContext>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="freight-amount">Freight Amount (Base)</Label>
                <Input id="freight-amount" type="number" step="0.01" min="0" placeholder="Freight amount" value={freightAmount} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setFreightAmount)} disabled={hasRole("dispatch") && !hasRole("manager") && !hasRole("admin") && !hasRole("accounting")} className={hasRole("dispatch") && !hasRole("manager") && !hasRole("admin") && !hasRole("accounting") ? "bg-muted cursor-not-allowed" : ""} />
                <p className="text-sm text-muted-foreground">
                  Total Company Revenue:{" "}
                  <span className="font-semibold text-primary">${totalCompanyRevenue.toFixed(2)}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-price">Driver Rate (Base)</Label>
                <Input id="driver-price" type="number" step="0.01" min="0" placeholder="Driver Rate" value={driverPrice} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setDriverPrice)} />
                <p className="text-sm text-muted-foreground">
                  Total Driver Pay:{" "}
                  <span className="font-semibold text-green-600 dark:text-green-400">${totalDriverPay.toFixed(2)}</span>
                </p>
              </div>
            </div>

            {/* Additional Button */}
            {!showAdditionalFields && <div className="flex justify-center">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAdditionalFields(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Additional
                </Button>
              </div>}

            {/* Additional Fields Section */}
            {showAdditionalFields && <div className="space-y-4 border border-muted rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Additional Charges</Label>
                </div>

                {/* Accessorial Charges - Company/Driver Split */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="detention" className="text-sm">
                      Detention - Company
                    </Label>
                    <Input id="detention" type="number" step="0.01" min="0" placeholder="0.00" value={detention} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setDetention)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="detention-driver" className="text-sm">
                      Detention - Driver
                    </Label>
                    <Input id="detention-driver" type="number" step="0.01" min="0" placeholder="0.00" value={detentionDriver} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setDetentionDriver)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="layover" className="text-sm">
                      Layover - Company
                    </Label>
                    <Input id="layover" type="number" step="0.01" min="0" placeholder="0.00" value={layover} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setLayover)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="layover-driver" className="text-sm">
                      Layover - Driver
                    </Label>
                    <Input id="layover-driver" type="number" step="0.01" min="0" placeholder="0.00" value={layoverDriver} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setLayoverDriver)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="extra-stop" className="text-sm">
                      Extra Stop - Company
                    </Label>
                    <Input id="extra-stop" type="number" step="0.01" min="0" placeholder="0.00" value={extraStop} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setExtraStop)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lumper" className="text-sm">
                      Lumper - Company
                    </Label>
                    <Input id="lumper" type="number" step="0.01" min="0" placeholder="0.00" value={lumper} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setLumper)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="late-fee" className="text-sm">
                      Late Fee - Company
                    </Label>
                    <Input id="late-fee" type="number" step="0.01" min="0" placeholder="0.00" value={lateFee} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setLateFee)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="late-fee-driver" className="text-sm">
                      Late Fee - Driver
                    </Label>
                    <Input id="late-fee-driver" type="number" step="0.01" min="0" placeholder="0.00" value={lateFeeDriver} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setLateFeeDriver)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="no-tracking-fee" className="text-sm">
                      No Tracking Fee - Company
                    </Label>
                    <Input id="no-tracking-fee" type="number" step="0.01" min="0" placeholder="0.00" value={noTrackingFee} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setNoTrackingFee)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="no-tracking-fee-driver" className="text-sm">
                      No Tracking Fee - Driver
                    </Label>
                    <Input id="no-tracking-fee-driver" type="number" step="0.01" min="0" placeholder="0.00" value={noTrackingFeeDriver} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setNoTrackingFeeDriver)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wrong-address-fee" className="text-sm">
                      Wrong Address Fee-Company
                    </Label>
                    <Input id="wrong-address-fee" type="number" step="0.01" min="0" placeholder="0.00" value={wrongAddressFee} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setWrongAddressFee)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wrong-address-fee-driver" className="text-sm">
                      Wrong Address Fee - Driver
                    </Label>
                    <Input id="wrong-address-fee-driver" type="number" step="0.01" min="0" placeholder="0.00" value={wrongAddressFeeDriver} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setWrongAddressFeeDriver)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tonu" className="text-sm">
                      TONU - Company
                    </Label>
                    <Input id="tonu" type="number" step="0.01" min="0" placeholder="0.00" value={tonu} onKeyDown={handleNumericKeyDown} onChange={e => {
                  const value = e.target.value;
                  // Allow empty string or non-negative numbers
                  if (value === "" || parseFloat(value) >= 0) {
                    setTonu(value);
                    // If TONU has a value, set freight amount, loaded miles, and driver price to 0
                    if (value && parseFloat(value) > 0) {
                      setFreightAmount("0");
                      setLoadedMiles("0");
                      setDriverPrice("0");
                    }
                  }
                }} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tonu-driver" className="text-sm">
                      TONU - Driver
                    </Label>
                    <Input id="tonu-driver" type="number" step="0.01" min="0" placeholder="0.00" value={tonuDriver} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setTonuDriver)} className="bg-green-50/50 dark:bg-green-950/20" />
                  </div>
                </div>

                {/* Escort Fee Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="escort-fee">Escort Fee</Label>
                    <Input id="escort-fee" type="number" step="0.01" min="0" placeholder="0.00" value={escortFee} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setEscortFee)} className="bg-blue-50/50 dark:bg-blue-950/20" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="escort-broker-paid">Broker Paid Escort Fee</Label>
                    <div className="flex items-center gap-3 h-10">
                      <Switch id="escort-broker-paid" checked={escortFeeBrokerPaid} onCheckedChange={setEscortFeeBrokerPaid} />
                      <span className="text-sm text-muted-foreground">
                        {escortFeeBrokerPaid ? "✓ Included in total revenue" : "Not included in total revenue"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loaded-miles">Loaded Miles</Label>
                <Input id="loaded-miles" type="number" min="0" placeholder="Loaded miles" value={loadedMiles} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setLoadedMiles)} disabled={hasRole("dispatch") && !hasRole("manager") && !hasRole("admin") && !hasRole("accounting")} className={hasRole("dispatch") && !hasRole("manager") && !hasRole("admin") && !hasRole("accounting") ? "bg-muted cursor-not-allowed" : ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dh-miles">DH Miles</Label>
                <Input id="dh-miles" type="number" min="0" placeholder="Deadhead miles" value={dhMiles} onKeyDown={handleNumericKeyDown} onChange={handleNumericChange(setDhMiles)} disabled={hasRole("dispatch") && !hasRole("manager") && !hasRole("admin") && !hasRole("accounting")} className={hasRole("dispatch") && !hasRole("manager") && !hasRole("admin") && !hasRole("accounting") ? "bg-muted cursor-not-allowed" : ""} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="booked-by">Booked By</Label>
                {hasRole("manager") || hasRole("admin") ? <Combobox options={profiles.map(p => ({
                value: p.full_name,
                label: p.full_name
              }))} value={bookedBy} onValueChange={setBookedBy} placeholder="Select person" searchPlaceholder="Search names..." /> : <Input id="booked-by" value={bookedBy || "Not assigned"} disabled className="bg-muted cursor-not-allowed" />}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" placeholder="Additional notes" value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
            </div>

            {/* Transfer Details Section */}
            {isRecovery && <div className="space-y-4 p-4 border border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="bg-amber-500">
                    TRANSFER LOAD
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {recoveryDate && `Transfer Date: ${new Date(recoveryDate).toLocaleDateString()}`}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Original Assignment</h4>
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
                        <span className="text-muted-foreground">Driver Rate:</span>{" "}
                        <span className="font-medium">${parseFloat(originalDriverPrice || "0").toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Transfer Assignment</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Miles:</span>{" "}
                        <span className="font-medium">{recoveryMiles || "0"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Driver Rate:</span>{" "}
                        <span className="font-medium">${parseFloat(recoveryDriverPrice || "0").toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>}

            {/* File Upload Sections - Disabled when locked */}
            {isLocked && <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">File uploads are disabled for locked orders</p>
              </div>}
            {!isLocked && <>
                {/* RC Upload Section - Top Priority */}
                <Card className={cn("cursor-pointer transition-all duration-200 hover:shadow-md", dragStates.rc && "border-blue-400 bg-blue-50/50 scale-[1.02]")} {...rcDragHandlers} onClick={handleCardClick("rc")}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-blue-700 flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      RC (Rate Confirmation) Upload
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-blue-700">
                        {rcFiles && rcFiles.length > 0 ? `${rcFiles.length} file(s) selected` : "Click or drag files here"}
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={handleExtractWithAI} disabled={isExtracting || !rcFiles || rcFiles.length === 0 || !Array.from(rcFiles || []).some(f => f.type === "application/pdf")} className="gap-2 bg-blue-600 text-white hover:bg-blue-700 border-blue-600" data-ai-extract="true">
                        <Sparkles className="h-4 w-4" />
                        {isExtracting ? "Extracting..." : "Extract with AI"}
                      </Button>
                    </div>

                    {dragStates.rc ? <div className="border-2 border-dashed border-blue-400 rounded-lg p-6 text-center bg-blue-50">
                        <FileText className="mx-auto h-8 w-8 text-blue-500 mb-2" />
                        <p className="text-sm text-blue-600 font-medium">Drop files here</p>
                      </div> : <>
                        {rcFiles && rcFiles.length > 0 && <div className="space-y-1 mb-2">
                            {Array.from(rcFiles).map((file, index) => <div key={index} className="flex items-center gap-1 text-sm text-gray-600">
                                <FileText className="h-4 w-4" />
                                <span className="truncate">{file.name}</span>
                              </div>)}
                          </div>}
                      </>}

                    <input ref={rcFileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={e => setRcFiles(e.target.files)} className="hidden" />
                    <p className="text-xs text-blue-600">
                      Rate confirmation files. AI extraction works only with PDF files.
                    </p>
                  </CardContent>
                </Card>

                {/* Additional File Upload Sections */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className={cn("cursor-pointer transition-all duration-200 hover:shadow-md", dragStates.bol && "border-green-400 bg-green-50/50 scale-[1.02]")} {...bolDragHandlers} onClick={handleCardClick("bol")}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-green-700 flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        BOL (Bill of Lading)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dragStates.bol ? <div className="border-2 border-dashed border-green-400 rounded-lg p-4 text-center bg-green-50">
                          <FileText className="mx-auto h-6 w-6 text-green-500 mb-1" />
                          <p className="text-xs text-green-600 font-medium">Drop files here</p>
                        </div> : <>
                          <p className="text-xs text-green-600 mb-2">
                            {bolFiles && bolFiles.length > 0 ? `${bolFiles.length} file(s) selected` : "Click or drag files here"}
                          </p>
                          {bolFiles && bolFiles.length > 0 && <div className="space-y-1 mb-2">
                              {Array.from(bolFiles).map((file, index) => <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                                  <FileText className="h-3 w-3" />
                                  <span className="truncate">{file.name}</span>
                                </div>)}
                            </div>}
                        </>}
                      <input ref={bolFileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={e => setBolFiles(e.target.files)} className="hidden" />
                      <p className="text-xs text-green-600">Bill of lading documents</p>
                    </CardContent>
                  </Card>

                  <Card className={cn("cursor-pointer transition-all duration-200 hover:shadow-md", dragStates.pod && "border-purple-400 bg-purple-50/50 scale-[1.02]")} {...podDragHandlers} onClick={handleCardClick("pod")}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-purple-700 flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        POD (Proof of Delivery)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dragStates.pod ? <div className="border-2 border-dashed border-purple-400 rounded-lg p-4 text-center bg-purple-50">
                          <FileText className="mx-auto h-6 w-6 text-purple-500 mb-1" />
                          <p className="text-xs text-purple-600 font-medium">Drop files here</p>
                        </div> : <>
                          <p className="text-xs text-purple-600 mb-2">
                            {podFiles && podFiles.length > 0 ? `${podFiles.length} file(s) selected` : "Click or drag files here"}
                          </p>
                          {podFiles && podFiles.length > 0 && <div className="space-y-1 mb-2">
                              {Array.from(podFiles).map((file, index) => <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                                  <FileText className="h-3 w-3" />
                                  <span className="truncate">{file.name}</span>
                                </div>)}
                            </div>}
                        </>}
                      <input ref={podFileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={e => setPodFiles(e.target.files)} className="hidden" />
                      <p className="text-xs text-purple-600">Delivery confirmation documents</p>
                    </CardContent>
                  </Card>

                  <Card className={cn("cursor-pointer transition-all duration-200 hover:shadow-md", dragStates.additional && "border-orange-400 bg-orange-50/50 scale-[1.02]")} {...additionalDragHandlers} onClick={handleCardClick("additional")}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-orange-700 flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Additional Documents
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dragStates.additional ? <div className="border-2 border-dashed border-orange-400 rounded-lg p-4 text-center bg-orange-50">
                          <FileText className="mx-auto h-6 w-6 text-orange-500 mb-1" />
                          <p className="text-xs text-orange-600 font-medium">Drop files here</p>
                        </div> : <>
                          <p className="text-xs text-orange-600 mb-2">
                            {additionalFiles && additionalFiles.length > 0 ? `${additionalFiles.length} file(s) selected` : "Click or drag files here"}
                          </p>
                          {additionalFiles && additionalFiles.length > 0 && <div className="space-y-1 mb-2">
                              {Array.from(additionalFiles).map((file, index) => <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                                  <FileText className="h-3 w-3" />
                                  <span className="truncate">{file.name}</span>
                                </div>)}
                            </div>}
                        </>}
                      <input ref={additionalFileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={e => setAdditionalFiles(e.target.files)} className="hidden" />
                      <p className="text-xs text-orange-600">Other supporting documents</p>
                    </CardContent>
                  </Card>
                </div>
              </>}

            {existingFiles.length > 0 && <div className="space-y-2">
                <Label>Existing Files</Label>
                <div className="flex flex-wrap gap-2">
                  {existingFiles.filter(file => !filesToDelete.includes(file.id)).map(file => <div key={file.id} className="flex items-center gap-2 p-2 border rounded">
                      <span className="text-sm">
                        {file.file_name} ({file.file_category || "ADDITIONAL"})
                      </span>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
                  const {
                    data,
                    error
                  } = await supabase.storage.from("order-files").createSignedUrl(file.file_path, 3600);

                  if (error) {
                    toast({
                      title: "Error",
                      description: "Failed to load file: " + error.message,
                      variant: "destructive"
                    });
                    return;
                  }
                  const signedUrl = data?.signedUrl || (data as any)?.signedURL;
                  if (signedUrl) {
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
                          variant: "destructive"
                        });
                      }
                    } catch (err) {
                      console.error("Error opening file:", err);
                      toast({
                        title: "Error",
                        description: "Failed to open file",
                        variant: "destructive"
                      });
                    }
                  } else {
                    toast({
                      title: "Error",
                      description: "No signed URL received from server",
                      variant: "destructive"
                    });
                  }
                }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
                  const {
                    data,
                    error
                  } = await supabase.storage.from("order-files").createSignedUrl(file.file_path, 3600);

                  if (error) {
                    toast({
                      title: "Error",
                      description: "Failed to load file: " + error.message,
                      variant: "destructive"
                    });
                    return;
                  }
                  const signedUrl = data?.signedUrl || (data as any)?.signedURL;
                  if (signedUrl) {
                    try {
                      const response = await fetch(signedUrl);
                      if (!response.ok) throw new Error("Failed to fetch file");
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
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
                        variant: "destructive"
                      });
                    }
                  } else {
                    toast({
                      title: "Error",
                      description: "No signed URL received from server",
                      variant: "destructive"
                    });
                  }
                }}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => {
                  setFilesToDelete(prev => [...prev, file.id]);
                }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>)}
                </div>
              </div>}
              
              {filesToDelete.length > 0 && <div className="p-4 border border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-950/20">
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
              </div>}

            {/* Driver-specific Pickup/Delivery Times for Load Confirmation */}
            

            {/* Generate Load Confirmation Button */}
            <div className="flex justify-center mt-6">
              <Button type="button" variant="outline" onClick={handleGenerateConfirmation} disabled={isGeneratingConfirmation || !truck || !driver1 || pickupsDrops.length < 2} className="w-full max-w-md">
                {isGeneratingConfirmation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <FileText className="mr-2 h-4 w-4" />
                Generate Load Confirmation
              </Button>
            </div>

            {/* Email to Driver Section */}
            <Card className="bg-blue-50/30 border-blue-200 mt-6">
              <CardHeader>
                <CardTitle className="text-base">Email to Driver</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Upload a file to send to the driver via email
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Card className={cn("cursor-pointer transition-all duration-200 hover:shadow-md", dragStates.email && "border-blue-400 bg-blue-50/50 scale-[1.02]")} {...emailDragHandlers}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-blue-700 flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Load Confirmation File
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dragStates.email ? <div className="border-2 border-dashed border-blue-400 rounded-lg p-4 text-center bg-blue-50">
                        <FileText className="mx-auto h-6 w-6 text-blue-500 mb-1" />
                        <p className="text-xs text-blue-600 font-medium">Drop file here</p>
                      </div> : <>
                        <p className="text-xs text-blue-600 mb-2">
                          {emailFiles.length > 0 ? `${emailFiles.length} file(s) selected` : "Click or drag file here"}
                        </p>
                        {emailFiles.length > 0 && <div className="space-y-1 mb-2">
                            {emailFiles.map((file, index) => <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                                <FileText className="h-3 w-3" />
                                <span className="truncate">{file.name}</span>
                              </div>)}
                          </div>}
                      </>}
                    <input ref={emailFileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      setEmailFiles(Array.from(e.target.files));
                    }
                  }} className="hidden" />
                    <p className="text-xs text-blue-600">
                      Upload the load confirmation to email to driver
                    </p>
                  </CardContent>
                </Card>

                <div className="flex justify-center">
                  <Button type="button" variant="outline" onClick={handleSendEmailToDriver} disabled={isSendingEmail || emailSent || emailFiles.length === 0} className="w-full max-w-md">
                    {isSendingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {emailSent ? <>
                        <Mail className="mr-2 h-4 w-4" />
                        Email Sent ✓
                      </> : <>
                        <Mail className="mr-2 h-4 w-4" />
                        Email to Driver
                      </>}
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
                    onClick={() => setYardDialogOpen(true)}
                  >
                    <Warehouse className="h-4 w-4 mr-2" />
                    Left Trailer at the Yard
                  </Button>
                )}
              </div>
              <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => {
              const shouldReturnToYardLoads = localStorage.getItem('returnToYardLoads') === 'true';
              const shouldReturnToOrders = localStorage.getItem('returnToOrders') === 'true';
              
              if (returnToReports) {
                localStorage.removeItem('returnToReports');
                navigate("/reports");
                window.scrollTo(0, 0);
              } else if (shouldReturnToYardLoads) {
                localStorage.removeItem('returnToYardLoads');
                navigate("/yard-loads");
                window.scrollTo(0, 0);
              } else if (shouldReturnToOrders) {
                navigate("/orders");
                window.scrollTo(0, 0);
              } else {
                navigate("/orders");
              }
            }}>
                Cancel
              </Button>
                {(hasRole("manager") || hasRole("supervisor") || hasRole("admin") || hasRole("dispatch")) && !isRecovery && !isLocked && <Button type="button" variant="secondary" onClick={() => setRecoveryDialogOpen(true)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Transfer Load
                    </Button>}
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </> : "Update Order"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <RecoveryLoadDialog open={recoveryDialogOpen} onOpenChange={setRecoveryDialogOpen} onSave={handleRecoverySave} currentDriver={originalDriverName || drivers?.find(d => d.id === driver1)?.name || "N/A"} currentTruck={originalTruckNumber || trucks?.find(t => t.id === truck)?.truck_number || "N/A"} currentTrailer={originalTrailerNumber || trailer || "N/A"} totalMiles={parseInt(loadedMiles) || 0} totalDriverRate={parseFloat(driverPrice) || 0} />

      {/* Yard Dialog */}
      <AlertDialog open={yardDialogOpen} onOpenChange={setYardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Left Trailer at the Yard</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear the driver and truck assignments from this load. The trailer will be marked as available at the yard. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeftAtYard}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
};
export default EditOrder;