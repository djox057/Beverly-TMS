import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { BrokerCombobox } from "@/components/ui/broker-combobox";
import { Textarea } from "@/components/ui/textarea";
import { DateTimeRangePicker } from "@/components/ui/datetime-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, GripVertical, Sparkles, Upload, FileText, AlertCircle, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { DateRange } from "react-day-picker";
import { cn, toTitleCase, formatZipCode } from "@/lib/utils";
import { US_STATES } from "@/lib/constants";
import { useCompanies } from "@/hooks/useCompanies";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useBrokers } from "@/hooks/useBrokers";
import { useNextInternalLoadNumber } from "@/hooks/useNextInternalLoadNumber";
import { supabase } from "@/integrations/supabase/client";
import { parseAddress } from "@/utils/addressParser";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { uploadOrderFilePreserveName } from "@/utils/orderFilesUpload";
import { useToast } from "@/components/ui/use-toast";
import { useAuthContext } from "@/contexts/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useTruckLastDelivery } from "@/hooks/useTruckLastDelivery";
import { combineDateAndTime } from "@/utils/dateUtils";
import { calculateLoadedMiles, calculateMultiStopMiles, calculateDhMiles, geocodeAddress, Coordinates } from "@/utils/mapboxRouteCalculator";
import { toZonedTime } from "date-fns-tz";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MissingDataConfirmDialog } from "@/components/MissingDataConfirmDialog";
import { DuplicateStopsConfirmDialog } from "@/components/DuplicateStopsConfirmDialog";
import { MilesChangeReasonDialog, checkMilesChange, getMilesChangeSmsRecipients, buildMilesChangeSmsMessage } from "@/components/MilesChangeReasonDialog";


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
  companyName?: string;
  latitude?: number;
  longitude?: number;
}
const NewOrder = () => {
  const navigate = useNavigate();
  
  // Partial loads state
  const [isPartial, setIsPartial] = useState(false);
  const [partialCount, setPartialCount] = useState(2);
  const [partialDragStates, setPartialDragStates] = useState<boolean[]>([false, false, false, false]);
  
  // Convert to arrays for partial loads
  const [bookedByCompany, setBookedByCompany] = useState("");
  const [bookedByCompanies, setBookedByCompanies] = useState<string[]>(["", "", "", ""]);
  const [broker, setBroker] = useState("");
  const [brokers, setBrokers] = useState<string[]>(["", "", "", ""]);
  const [brokerLoadNumber, setBrokerLoadNumber] = useState("");
  const [brokerLoadNumbers, setBrokerLoadNumbers] = useState<string[]>(["", "", "", ""]);
  const [rcFilesArray, setRcFilesArray] = useState<File[][]>([[], [], [], []]);
  
  const [truck, setTruck] = useState("");
  const [driver1, setDriver1] = useState("");
  const [driver2, setDriver2] = useState("");
  const [trailer, setTrailer] = useState("");
  const [pickupDateRange, setPickupDateRange] = useState<DateRange>();
  const [deliveryDateRange, setDeliveryDateRange] = useState<DateRange>();
  const [freightAmount, setFreightAmount] = useState("");
  const [driverPrice, setDriverPrice] = useState("");
  const [tonu, setTonu] = useState("");
  const [dhMiles, setDhMiles] = useState("");
  const [loadedMiles, setLoadedMiles] = useState("");
  const [commodity, setCommodity] = useState("");
  const [weight, setWeight] = useState("");
  const [pickupPuNumber, setPickupPuNumber] = useState("");
  const [pickupPoNumber, setPickupPoNumber] = useState("");
  const [pickupShipper, setPickupShipper] = useState("");
  const [deliveryPoNumber, setDeliveryPoNumber] = useState("");
  const [deliveryShipper, setDeliveryShipper] = useState("");
  const [pickupsDrops, setPickupsDrops] = useState<PickupDrop[]>([]);
  const [rcFiles, setRcFiles] = useState<File[]>([]);
  const [bolFiles, setBolFiles] = useState<File[]>([]);
  const [podFiles, setPodFiles] = useState<File[]>([]);
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingConfirmation, setIsGeneratingConfirmation] = useState(false);
  const [isCalculatingMiles, setIsCalculatingMiles] = useState(false);
  const [isCalculatingDhMiles, setIsCalculatingDhMiles] = useState(false);
  const [hasAutoExtracted, setHasAutoExtracted] = useState(false);

  // Miles change tracking
  const autoCalcLoadedMilesRef = useRef<number | null>(null);
  const autoCalcDhMilesRef = useRef<number | null>(null);
  const [showMilesChangeDialog, setShowMilesChangeDialog] = useState(false);
  const [milesChangeInfo, setMilesChangeInfo] = useState<any>(null);
  const [pendingMilesSubmitEvent, setPendingMilesSubmitEvent] = useState<React.FormEvent | null>(null);
  const [pendingMilesSkipDuplicate, setPendingMilesSkipDuplicate] = useState(false);
  const [pendingMilesSkipDuplicateStops, setPendingMilesSkipDuplicateStops] = useState(false);

  // Email dispatch toggle states
  const [confirmationGenerated, setConfirmationGenerated] = useState(false);
  const [generatedConfirmationBlob, setGeneratedConfirmationBlob] = useState<Blob | null>(null);
  const [generatedConfirmationFilename, setGeneratedConfirmationFilename] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailFiles, setEmailFiles] = useState<File[]>([]);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Driver-specific pickup/delivery times for load confirmation only
  const [driverPickupDateRange, setDriverPickupDateRange] = useState<DateRange>();
  const [driverPickupStartTime, setDriverPickupStartTime] = useState("");
  const [driverPickupEndTime, setDriverPickupEndTime] = useState("");
  const [driverDeliveryDateRange, setDriverDeliveryDateRange] = useState<DateRange>();
  const [driverDeliveryStartTime, setDriverDeliveryStartTime] = useState("");
  const [driverDeliveryEndTime, setDriverDeliveryEndTime] = useState("");

  // Duplicate order warning
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateOrders, setDuplicateOrders] = useState<any[]>([]);

  // Missing data warning
  const [showMissingDataDialog, setShowMissingDataDialog] = useState(false);
  const [missingDataDetails, setMissingDataDetails] = useState<
    Array<{
      location: string;
      type: "pickup" | "delivery";
      missingFields: string[];
    }>
  >([]);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Duplicate stops warning
  const [showDuplicateStopsDialog, setShowDuplicateStopsDialog] = useState(false);
  const [duplicateStops, setDuplicateStops] = useState<any[]>([]);
  const { toast } = useToast();
  const { profile, hasRole } = useAuthContext();
  const queryClient = useQueryClient();

  // Company email configuration
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

  // Fetch data from database with proper error handling
  const {
    data: companies,
    isLoading: companiesLoading,
    error: companiesError,
    refetch: refetchCompanies,
  } = useCompanies();
  const { data: allTrucks, isLoading: trucksLoading, error: trucksError } = useTrucks();
  const { data: allDrivers, isLoading: driversLoading, error: driversError } = useDrivers();
  const { data: allBrokers } = useBrokers();

  // Filter trucks by dispatcher for dispatch role - check driver dispatcher
  // First, get the list of driver IDs assigned to this dispatcher
  const isDispatchOnly =
    hasRole("dispatch") &&
    !hasRole("manager") &&
    !hasRole("admin") &&
    !hasRole("afterhours") &&
    !hasRole("accounting") &&
    !hasRole("supervisor") &&
    !hasRole("safety");
  const dispatcherDriverIds =
    isDispatchOnly && profile?.user_id
      ? allDrivers?.filter((driver) => driver.dispatcher_id === profile.user_id).map((d) => d.id) || []
      : [];
  const trucks = allTrucks?.filter((truck) => {
    if (profile?.user_id && isDispatchOnly) {
      // Show ONLY trucks that have a driver assigned to this dispatcher
      // Dispatch users should only see trucks from their /fleets
      return truck.driver1_id && dispatcherDriverIds.includes(truck.driver1_id);
    }
    return true;
  });

  // Filter drivers by dispatcher for dispatch role
  const drivers = allDrivers?.filter((driver) => {
    if (profile?.user_id && isDispatchOnly) {
      // If driver has no dispatcher assigned, show to all dispatchers (so they can be assigned)
      // Otherwise, only show if dispatcher_id matches current user
      return !driver.dispatcher_id || driver.dispatcher_id === profile.user_id;
    }
    return true;
  });

  // Only show BF Prime LLC and Beverly Freight Inc for "Booked by company" dropdown
  const filteredCompanies = companies?.filter(
    (c) => c.name === "BF Prime LLC" || c.name === "Beverly Freight Inc"
  );

  // Get company_id from selected driver1 (not from truck)
  const selectedDriver1 = allDrivers?.find((d) => d.id === driver1);
  const driverCompanyId = selectedDriver1?.company_id;
  const { data: nextInternalLoadNumber, isLoading: loadingNextNumber } = useNextInternalLoadNumber(driverCompanyId);

  // Get the first pickup datetime for DH miles calculation
  const firstPickupDatetime = pickupsDrops.find((item) => item.type === "pickup")?.datetime || null;
  const { data: lastDelivery } = useTruckLastDelivery(driver1 || null, firstPickupDatetime);

  // Auto-extract AI when RC file is uploaded (only for single load mode)
  useEffect(() => {
    // Skip auto-extraction for partial loads
    if (isPartial) {
      return;
    }
    
    // Original single load logic
    if (rcFiles.length === 0) {
      setHasAutoExtracted(false);
      return;
    }

    if (!hasAutoExtracted && !isExtracting) {
      const pdfFile = rcFiles.find((file) => file.type === "application/pdf");
      if (pdfFile) {
        setHasAutoExtracted(true);
        handleExtractWithAI();
      }
    }
  }, [rcFiles, isPartial]);

  // Pre-select BF Prime company as default
  useEffect(() => {
    console.log("🏢 Companies effect triggered", {
      companiesCount: companies?.length,
      bookedByCompany,
      companiesLoading,
      companiesError: companiesError?.message,
    });

    // Wait for companies to load and only set if not already selected
    if (!companiesLoading && companies && companies.length > 0 && !bookedByCompany) {
      const bfPrime = companies.find((c) => c.name === "BF Prime");
      if (bfPrime) {
        console.log("🏢 Auto-selecting BF Prime company:", bfPrime.id);
        setBookedByCompany(bfPrime.id);
      } else {
        console.log(
          "🏢 BF Prime not found, available companies:",
          companies.map((c) => c.name),
        );
      }
    }
  }, [companies, bookedByCompany, companiesLoading, companiesError]);

  // Initialize with one pickup and one delivery
  useEffect(() => {
    const defaultPickup: PickupDrop = {
      id: "pickup-1",
      type: "pickup",
      address: "",
      datetime: "",
      dateRange: undefined,
      startTime: "",
      endTime: "",
    };
    const defaultDelivery: PickupDrop = {
      id: "delivery-1",
      type: "delivery",
      address: "",
      datetime: "",
      dateRange: undefined,
      startTime: "",
      endTime: "",
    };
    setPickupsDrops([defaultPickup, defaultDelivery]);
  }, []);

  // Track if trailer was manually edited to prevent auto-overwrite
  const [trailerManuallyEdited, setTrailerManuallyEdited] = useState(false);
  const [lastSelectedTruckId, setLastSelectedTruckId] = useState<string>("");

  // Auto-populate trailer and drivers when truck is selected
  useEffect(() => {
    if (truck && trucks) {
      const selectedTruck = trucks.find((t) => t.id === truck);
      if (selectedTruck) {
        // Reset manual edit flag when switching to a different truck
        if (truck !== lastSelectedTruckId) {
          setTrailerManuallyEdited(false);
          setLastSelectedTruckId(truck);
        }

        // Autofill trailer if not manually edited or if truck changed
        if (!trailerManuallyEdited && selectedTruck.trailer?.trailer_number) {
          setTrailer(selectedTruck.trailer.trailer_number);
        }

        // Autofill driver IDs (use nested object if available, otherwise use direct ID)
        if (selectedTruck.driver1?.id) {
          setDriver1(selectedTruck.driver1.id);
        } else if (selectedTruck.driver1_id) {
          setDriver1(selectedTruck.driver1_id);
        } else {
          setDriver1("");
        }
        if (selectedTruck.driver2?.id) {
          setDriver2(selectedTruck.driver2.id);
        } else if (selectedTruck.driver2_id) {
          setDriver2(selectedTruck.driver2_id);
        } else {
          setDriver2("");
        }
      }
    } else {
      // Clear fields when truck is deselected
      setTrailer("");
      setDriver1("");
      setDriver2("");
      setTrailerManuallyEdited(false);
      setLastSelectedTruckId("");
    }
  }, [truck, trucks, trailerManuallyEdited, lastSelectedTruckId]);

  // Auto-calculate loaded miles and geocode addresses when pickups/drops change
  useEffect(() => {
    const geocodeAndCalculateMiles = async () => {
      if (pickupsDrops.length < 2) return;

      // Geocode all addresses that don't have coordinates yet
      const itemsToGeocode = pickupsDrops.filter(item => 
        item.address.trim() && (item.latitude === undefined || item.longitude === undefined)
      );
      
      if (itemsToGeocode.length > 0) {
        const updatedItems = [...pickupsDrops];
        let hasUpdates = false;
        
        for (const item of itemsToGeocode) {
          const fullAddress = [item.address, item.city, item.state, item.zipCode]
            .filter(Boolean)
            .join(', ');
          
          const coords = await geocodeAddress(fullAddress);
          if (coords) {
            const index = updatedItems.findIndex(i => i.id === item.id);
            if (index !== -1) {
              updatedItems[index] = {
                ...updatedItems[index],
                latitude: coords.lat,
                longitude: coords.lon
              };
              hasUpdates = true;
              console.log(`📍 Geocoded ${item.type}: ${fullAddress} -> ${coords.lat}, ${coords.lon}`);
            }
          }
        }
        
        if (hasUpdates) {
          setPickupsDrops(updatedItems);
          return; // Will re-trigger with updated coordinates
        }
      }

      // Get all addresses in order for mile calculation
      // Always build full address from separate fields for consistent geocoding
      const addresses = pickupsDrops.filter(item => item.address.trim()).map(item => {
        const parts = [item.address];
        if (item.city) parts.push(item.city);
        if (item.state) parts.push(item.state);
        if (item.zipCode) parts.push(item.zipCode);
        return parts.join(', ');
      });
      if (addresses.length < 2) {
        return;
      }
      setIsCalculatingMiles(true);
      try {
        let miles: number | null = null;
        if (addresses.length === 2) {
          miles = await calculateLoadedMiles(addresses[0], addresses[1]);
        } else {
          miles = await calculateMultiStopMiles(addresses);
        }
        if (miles !== null) {
          setLoadedMiles(miles.toString());
          autoCalcLoadedMilesRef.current = miles;
          toast({
            title: "Loaded Miles Calculated",
            description: addresses.length > 2 ? `Multi-stop route distance: ${miles} miles through ${addresses.length} stops` : `Route distance: ${miles} miles`
          });
        }
      } catch (error) {
        console.error('Error calculating loaded miles:', error);
      } finally {
        setIsCalculatingMiles(false);
      }
    };

    const timeoutId = setTimeout(geocodeAndCalculateMiles, 1500);
    return () => clearTimeout(timeoutId);
  }, [pickupsDrops, toast]);

  // Auto-calculate DH miles when truck is selected and pickup address is entered
  useEffect(() => {
    const calculateDh = async () => {
      if (!truck || !lastDelivery) {
        return;
      }
      const firstPickup = pickupsDrops.find(item => item.type === 'pickup' && item.address.trim());
      if (!firstPickup) {
        return;
      }

      // Always build full address from separate parts for consistent geocoding
      const addressParts = [firstPickup.address];
      if (firstPickup.city) addressParts.push(firstPickup.city);
      if (firstPickup.state) addressParts.push(firstPickup.state);
      if (firstPickup.zipCode) addressParts.push(firstPickup.zipCode);
      const pickupAddress = addressParts.join(', ');
      
      setIsCalculatingDhMiles(true);
      try {
        const miles = await calculateDhMiles(lastDelivery.deliveryAddress, pickupAddress);
        if (miles !== null) {
          setDhMiles(miles.toString());
          autoCalcDhMilesRef.current = miles;
          toast({
            title: "DH Miles Calculated",
            description: `Distance from last delivery: ${miles} miles`
          });
        } else {
          setDhMiles('0');
          autoCalcDhMilesRef.current = 0;
        }
      } catch (error) {
        console.error('Error calculating DH miles:', error);
      } finally {
        setIsCalculatingDhMiles(false);
      }
    };

    const timeoutId = setTimeout(calculateDh, 1500);
    return () => clearTimeout(timeoutId);
  }, [truck, lastDelivery, pickupsDrops, toast]);

  // Auto-calculate driver price for company drivers based on cents per mile
  useEffect(() => {
    if (!driver1 || !allDrivers) return;
    
    const selectedDriver = allDrivers.find(d => d.id === driver1);
    if (!selectedDriver?.is_company_driver || !selectedDriver?.cents_per_mile) return;
    
    const totalMiles = (parseFloat(dhMiles) || 0) + (parseFloat(loadedMiles) || 0);
    if (totalMiles <= 0) return;
    
    const calculatedPrice = totalMiles * (selectedDriver.cents_per_mile / 100);
    setDriverPrice(calculatedPrice.toFixed(2));
  }, [driver1, dhMiles, loadedMiles, allDrivers]);
  const addPickupDrop = (type: "pickup" | "delivery") => {
    const newItem: PickupDrop = {
      id: Date.now().toString(),
      type,
      address: "",
      datetime: "",
      dateRange: undefined,
      startTime: "",
      endTime: "",
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
      pickupsDrops.map((item) => {
        if (item.id === id) {
          const updated = {
            ...item,
            [field]: field === "city" && typeof value === "string" ? toTitleCase(value) : value,
          };

          // If updating address field, immediately parse it to preserve city/state/zipCode
          if (field === "address" && typeof value === "string" && value.trim()) {
            const parsed = parseAddress(value);
            updated.address = parsed.address || value;
            updated.city = parsed.city ? toTitleCase(parsed.city) : undefined;
            updated.state = parsed.state || undefined;
            updated.zipCode = parsed.zipCode ? formatZipCode(parsed.zipCode) : undefined;
          }

          // Auto-update datetime when relevant fields change
          if (field === "dateRange" || field === "startTime") {
            if (updated.dateRange?.from && updated.startTime) {
              const combined = combineDateAndTime(updated.dateRange.from, updated.startTime);
              updated.datetime = combined || "";
            } else {
              updated.datetime = "";
            }
          }
          return updated;
        }
        return item;
      }),
    );
  };
  const parsePickupDropAddress = (id: string) => {
    setPickupsDrops(
      pickupsDrops.map((item) => {
        if (item.id === id && item.address && item.address.trim()) {
          const parsed = parseAddress(item.address);
          return {
            ...item,
            address: parsed.address || item.address,
            city: parsed.city ? toTitleCase(parsed.city) : undefined,
            state: parsed.state || undefined,
            zipCode: parsed.zipCode ? formatZipCode(parsed.zipCode) : undefined,
          };
        }
        return item;
      }),
    );
  };
  const updatePickupDropDateRange = (id: string, dateRange: DateRange | undefined) => {
    setPickupsDrops(
      pickupsDrops.map((item) => {
        if (item.id === id) {
          const updated = {
            ...item,
            dateRange,
          };
          // Auto-update datetime when dateRange changes
          if (updated.dateRange?.from && updated.startTime) {
            const combined = combineDateAndTime(updated.dateRange.from, updated.startTime);
            updated.datetime = combined || "";
          } else {
            updated.datetime = "";
          }
          return updated;
        }
        return item;
      }),
    );
  };
  const updatePickupDropTime = (id: string, timeType: "startTime" | "endTime", time: string) => {
    setPickupsDrops(
      pickupsDrops.map((item) => {
        if (item.id === id) {
          const updated = {
            ...item,
            [timeType]: time,
          };
          // Auto-update datetime when startTime changes
          if (timeType === "startTime" && updated.dateRange?.from && updated.startTime) {
            const combined = combineDateAndTime(updated.dateRange.from, updated.startTime);
            updated.datetime = combined || "";
          } else if (timeType === "startTime") {
            updated.datetime = "";
          }
          return updated;
        }
        return item;
      }),
    );
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
        setDragStates((prev) => ({
          ...prev,
          [fileType]: true,
        }));
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
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
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragStates((prev) => ({
          ...prev,
          [fileType]: false,
        }));
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          setFiles(Array.from(files));
        }
      },
      onClick: (e: React.MouseEvent) => {
        // Don't trigger if clicking on buttons or interactive elements
        const target = e.target as HTMLElement;
        if (target.closest("button, input, a")) {
          return;
        }
        fileInputRef.current?.click();
      },
    };
  };
  const rcDragHandlers = createFileDragHandlers("rc");
  const bolDragHandlers = createFileDragHandlers("bol");
  const podDragHandlers = createFileDragHandlers("pod");
  const additionalDragHandlers = createFileDragHandlers("additional");
  const emailDragHandlers = createFileDragHandlers("email");
  const handleExtractWithAI = async () => {
    // Prevent multiple simultaneous extractions
    if (isExtracting) {
      console.log("Extraction already in progress, skipping...");
      return;
    }
    
    // Check for files based on mode
    let filesToExtract: File[] = [];
    let filePartialIndexMap: number[] = []; // Track which partial each file belongs to
    
    if (isPartial) {
      // For partial mode, flatten but keep track of which partial each file belongs to
      rcFilesArray.forEach((filesArray, partialIndex) => {
        filesArray.forEach(file => {
          filesToExtract.push(file);
          filePartialIndexMap.push(partialIndex);
        });
      });
    } else {
      filesToExtract = rcFiles;
    }
      
    if (filesToExtract.length === 0) {
      toast({
        title: "No RC File Selected",
        description: "Please select at least one PDF file to extract data from.",
        variant: "destructive",
      });
      return;
    }
    
    const pdfFiles = filesToExtract.filter((file) => file.type === "application/pdf");
    const pdfFilePartialIndexMap = isPartial 
      ? filePartialIndexMap.filter((_, index) => filesToExtract[index].type === "application/pdf")
      : [];
      
    if (pdfFiles.length === 0) {
      toast({
        title: "PDF Required",
        description: "Please select PDF file(s) for AI extraction.",
        variant: "destructive",
      });
      return;
    }
    
    setIsExtracting(true);
    try {
      console.log(`Starting PDF extraction for ${pdfFiles.length} file(s)...`);
      
      // Accumulate picks/drops from all files
      const allPickupsDrops: PickupDrop[] = [];
      
      // For partial loads, accumulate data from each partial
      const partialBrokerLoadNumbers = isPartial ? [...brokerLoadNumbers] : [];
      let totalFreightAmount = 0;
      let totalDriverPrice = 0;
      let firstMileage = 0;
      let firstCommodity = "";
      let firstWeight = 0;
      
      // Extract from each PDF file
      for (let fileIndex = 0; fileIndex < pdfFiles.length; fileIndex++) {
        const pdfFile = pdfFiles[fileIndex];
        console.log(`Processing file ${fileIndex + 1}/${pdfFiles.length}: ${pdfFile.name}`);
        
        const formData = new FormData();
        formData.append("pdf", pdfFile);
        
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch(`https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/extract-order-fields`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}`,
          },
          body: formData,
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Edge function error:", errorText);
          throw new Error(`Edge function failed with status ${response.status} for file ${pdfFile.name}`);
        }
        
        const data = await response.json();
        if (!data?.success) {
          console.error("Extraction failed:", data?.error);
          throw new Error(data?.error || `Failed to extract data from ${pdfFile.name}`);
        }
        
        const extractedData = data.data;
        console.log(`Successfully extracted data from file ${fileIndex + 1}:`, extractedData);

        // Determine which partial this file belongs to (for partial mode)
        const partialIndex = isPartial ? pdfFilePartialIndexMap[fileIndex] : 0;

        // Handle broker load number
        if (isPartial) {
          if (extractedData.brokerLoadNumber) {
            partialBrokerLoadNumbers[partialIndex] = extractedData.brokerLoadNumber;
          }
        } else if (fileIndex === 0 && extractedData.brokerLoadNumber) {
          setBrokerLoadNumber(extractedData.brokerLoadNumber);
        }
        
        // Accumulate freight amount and driver price
        if (extractedData.freightAmount) {
          const amount = parseFloat(extractedData.freightAmount.toString());
          if (!isNaN(amount)) {
            totalFreightAmount += amount;
          }
        }
        if (extractedData.driverPrice) {
          const price = parseFloat(extractedData.driverPrice.toString());
          if (!isNaN(price)) {
            totalDriverPrice += price;
          }
        }
        
        // For first file, capture other single-use fields
        if (fileIndex === 0) {
          if (extractedData.mileage) firstMileage = extractedData.mileage;
          if (extractedData.commodity) firstCommodity = extractedData.commodity;
          if (extractedData.weight) firstWeight = extractedData.weight;
        }

        // Helper function to safely create date range
        const createSafeDateRange = (dateStr: string | undefined): DateRange | undefined => {
          if (!dateStr) return undefined;
          try {
            const date = new Date(dateStr + "T12:00:00");
            if (isNaN(date.getTime())) return undefined;
            return { from: date, to: date };
          } catch {
            return undefined;
          }
        };

        // Set matched broker from first file by matching name
        if (fileIndex === 0 && extractedData.brokerName && allBrokers) {
          const brokerName = extractedData.brokerName.toLowerCase().trim();
          const matchedBroker = allBrokers.find(b => 
            b.name.toLowerCase().trim() === brokerName ||
            b.name.toLowerCase().includes(brokerName) ||
            brokerName.includes(b.name.toLowerCase())
          );
          if (matchedBroker) {
            setBroker(matchedBroker.id);
            console.log("Matched broker by name:", extractedData.brokerName, "->", matchedBroker.id);
          } else {
            console.log("No broker match found for:", extractedData.brokerName);
          }
        }

        // Set PU# and PO# from first file (single pickup/delivery mode)
        if (fileIndex === 0) {
          // Check for PU number from pickups
          if (extractedData.pickups?.[0]?.puNumber) {
            setPickupPuNumber(extractedData.pickups[0].puNumber);
            console.log("Set pickup PU#:", extractedData.pickups[0].puNumber);
          } else if (extractedData.pickupPuNumber) {
            setPickupPuNumber(extractedData.pickupPuNumber);
            console.log("Set pickup PU# (legacy):", extractedData.pickupPuNumber);
          }
          
          // Check for PO number from pickups
          if (extractedData.pickups?.[0]?.poNumber) {
            setPickupPoNumber(extractedData.pickups[0].poNumber);
            console.log("Set pickup PO#:", extractedData.pickups[0].poNumber);
          } else if (extractedData.pickupPoNumber) {
            setPickupPoNumber(extractedData.pickupPoNumber);
            console.log("Set pickup PO# (legacy):", extractedData.pickupPoNumber);
          }
          
          // Check for delivery PO number
          if (extractedData.deliveries?.[0]?.poNumber) {
            setDeliveryPoNumber(extractedData.deliveries[0].poNumber);
            console.log("Set delivery PO#:", extractedData.deliveries[0].poNumber);
          } else if (extractedData.deliveryPoNumber) {
            setDeliveryPoNumber(extractedData.deliveryPoNumber);
            console.log("Set delivery PO# (legacy):", extractedData.deliveryPoNumber);
          }
        }

        // Accumulate pickups from this file
        if (extractedData.pickups && extractedData.pickups.length > 0) {
          extractedData.pickups.forEach((pickup: any, index: number) => {
            const pickupDateRange = createSafeDateRange(pickup.date);
            allPickupsDrops.push({
              id: `pickup-${allPickupsDrops.filter(p => p.type === 'pickup').length + 1}`,
              type: "pickup",
              address: pickup.address || "",
              city: pickup.city ? toTitleCase(pickup.city) : "",
              state: pickup.state || "",
              zipCode: pickup.zip ? formatZipCode(pickup.zip) : "",
              datetime: pickup.date || "",
              dateRange: pickupDateRange,
              startTime: pickup.startTime || "",
              endTime: pickup.endTime || pickup.startTime || "",
              companyName: pickup.shipper || "",
            });
          });
        }

        // Accumulate deliveries from this file
        if (extractedData.deliveries && extractedData.deliveries.length > 0) {
          extractedData.deliveries.forEach((delivery: any, index: number) => {
            const deliveryDateRange = createSafeDateRange(delivery.date);
            allPickupsDrops.push({
              id: `delivery-${allPickupsDrops.filter(p => p.type === 'delivery').length + 1}`,
              type: "delivery",
              address: delivery.address || "",
              city: delivery.city ? toTitleCase(delivery.city) : "",
              state: delivery.state || "",
              zipCode: delivery.zip ? formatZipCode(delivery.zip) : "",
              datetime: delivery.date || "",
              dateRange: deliveryDateRange,
              startTime: delivery.startTime || "",
              endTime: delivery.endTime || delivery.startTime || "",
              companyName: delivery.shipper || "",
            });
          });
        }
      }
      
      // Set accumulated picks/drops
      if (allPickupsDrops.length > 0) {
        console.log(`Setting ${allPickupsDrops.length} total pickup/drop locations`);
        setPickupsDrops(allPickupsDrops);
      }
      
      // Update all accumulated state
      if (isPartial) {
        setBrokerLoadNumbers(partialBrokerLoadNumbers);
      }
      
      if (totalFreightAmount > 0) {
        setFreightAmount(totalFreightAmount.toString());
        // Set driver price to match freight amount if not extracted separately, or use total
        setDriverPrice(totalDriverPrice > 0 ? totalDriverPrice.toString() : totalFreightAmount.toString());
      } else if (totalDriverPrice > 0) {
        setDriverPrice(totalDriverPrice.toString());
      }
      
      // Note: Loaded miles are calculated via Mapbox from addresses, not from AI extraction
      if (firstCommodity) setCommodity(firstCommodity);
      if (firstWeight) setWeight(firstWeight.toString());

      toast({
        title: "Data Extracted Successfully",
        description: isPartial 
          ? `Extracted data from ${pdfFiles.length} file(s). Total freight: $${totalFreightAmount.toFixed(2)}. Found ${allPickupsDrops.length} pickup/drop locations.`
          : `Extracted data from ${pdfFiles.length} file(s). Found ${allPickupsDrops.length} pickup/drop locations. Please review and adjust as needed.`,
      });
    } catch (error: any) {
      console.error("Extraction error:", error);
      toast({
        title: "Extraction Failed",
        description: error.message || "Failed to extract data from PDF",
        variant: "destructive",
      });
      setIsExtracting(false);
    } finally {
      setIsExtracting(false);
    }
  };

  // Build email subject line
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

  // Send email to driver with uploaded file
  const handleSendEmailToDriver = async () => {
    // Check if email file is uploaded
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

      // Get driver email
      const driverForEmail = allDrivers?.find((d) => d.id === driver1);
      if (!driverForEmail?.email) {
        throw new Error("Driver email not found. Please ensure the driver has an email address.");
      }

      // Get driver company for email configuration
      let companyName = driverForEmail?.company?.name;

      // If company name is not in the driver object, fetch it from companies table
      if (!companyName && driverForEmail?.company_id) {
        console.log("📧 Company not in driver object, fetching from companies table...");
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("name")
          .eq("id", driverForEmail.company_id)
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

      // Build email subject
      const subject = buildEmailSubject();

      // Use the uploaded email file
      const emailFile = emailFiles[0];

      // Convert file to base64 for attachment
      const reader = new FileReader();
      reader.readAsDataURL(emailFile);
      await new Promise((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64data = reader.result as string;
            const base64Content = base64data.split(",")[1]; // Remove data:type;base64, prefix

            console.log("📧 Sending email with file:", emailFile.name);
            console.log("📧 To:", driverForEmail.email);
            console.log("📧 From:", emailConfig.sender);
            console.log("📧 CC:", emailConfig.cc);
            console.log("📧 Subject:", subject);

            // Call edge function to send email
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
                  to: driverForEmail.email,
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
            console.log("📧 Email response:", responseData);
            if (!response.ok) {
              console.error("❌ Error sending email - Status:", response.status);
              console.error("❌ Error response:", responseData);
              throw new Error(responseData.error || "Failed to send email");
            }
            
            // Log the email to driver_email_log table
            if (createdOrderId && driverForEmail.id) {
              console.log("📝 Logging email to driver_email_log:", {
                order_id: createdOrderId,
                driver_id: driverForEmail.id,
                sent_by: session?.user?.id,
              });
              
              const { error: logError } = await supabase
                .from('driver_email_log')
                .insert({
                  order_id: createdOrderId,
                  driver_id: driverForEmail.id,
                  email_type: 'load_confirmation',
                  sent_by: session?.user?.id,
                });
              
              if (logError) {
                console.error("❌ Error logging email:", logError);
              } else {
                console.log("✅ Email logged successfully");
              }
            } else {
              console.warn("⚠️ Cannot log email - missing order ID or driver ID:", {
                createdOrderId,
                driverId: driverForEmail.id,
              });
            }
            
            setEmailSent(true);
            toast({
              title: "Email Sent",
              description: `File sent to ${driverForEmail.email}`,
            });
            resolve(true);
          } catch (err) {
            console.error("❌ Email error:", err);
            reject(err);
          }
        };
        reader.onerror = reject;
      });
    } catch (error: any) {
      console.error("❌ Email sending error:", error);
      toast({
        title: "Email Failed",
        description: error.message || "Failed to send email to driver",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
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

      // Prepare base data for load confirmation
      const baseData = {
        brokerLoadNumber: brokerLoadNumber || "TBD",
        driverName: selectedDriver.name,
        truckNumber: selectedTruck.truck_number,
        trailerNumber: trailer ? trucks?.find((t) => t.id === truck)?.trailer?.trailer_number || "" : "",
        phoneNumber: selectedDriver.phone || "",
        commodity: commodity || "",
        weight: weight || "",
        miles: loadedMiles || "",
        rate: driverPrice || "",
      };

      // Helper to format location data
      const formatLocationData = (location: any) => ({
        address: location.address,
        cityStateZip:
          `${location.city || ""}${location.city && location.state ? ", " : ""}${location.state || ""}${(location.city || location.state) && location.zipCode ? " " : ""}${location.zipCode || ""}`.trim(),
        date: formatDate(location.dateRange),
        time: formatTime(location.startTime) + (location.endTime ? ` - ${formatTime(location.endTime)}` : ""),
      });

      // Build confirmation data with all pickups and deliveries
      const confirmationData: any = {
        ...baseData,
        // First pickup (always present)
        pickupShipper: pickups[0].companyName || "",
        pickupAddress: pickups[0].address,
        pickupCityStateZip: formatLocationData(pickups[0]).cityStateZip,
        pickupDate: formatLocationData(pickups[0]).date,
        pickupTime: formatLocationData(pickups[0]).time,
        pickupPuNumber: pickupPuNumber || "",
        pickupPoNumber: pickupPoNumber || "",
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
      const delivery1Data = formatLocationData(deliveries[0]);
      confirmationData.deliveryReceiver = deliveries[0].companyName || "";
      confirmationData.deliveryAddress = deliveries[0].address;
      confirmationData.deliveryCityStateZip = delivery1Data.cityStateZip;
      confirmationData.deliveryDate = delivery1Data.date;
      confirmationData.deliveryTime = delivery1Data.time;
      confirmationData.deliveryPoNumber = deliveryPoNumber || "";

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
      const response = await fetch(`https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/generate-load-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}`,
        },
        body: JSON.stringify(confirmationData),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to generate confirmation");
      }

      // Create a blob from the response
      const blob = await response.blob();
      const filename = `load-confirmation-${confirmationData.brokerLoadNumber}.pdf`;

      // Save blob and filename for email attachment
      setGeneratedConfirmationBlob(blob);
      setGeneratedConfirmationFilename(filename);
      setConfirmationGenerated(true); // Enable the email toggle
      setEmailSent(false); // Reset email sent state

      // Download the PDF
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Confirmation Generated",
        description: "Load confirmation PDF has been generated. You can now email it to the driver.",
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

  // Prepare options for dropdowns
  const companyOptions =
    filteredCompanies?.map((company) => ({
      value: company.id,
      label: company.name,
    })) || [];
  const truckOptions =
    trucks?.map((truck) => ({
      value: truck.id,
      label: truck.truck_number,
    })) || [];
  const driverOptions =
    drivers?.map((driver) => ({
      value: driver.id,
      label: driver.name,
    })) || [];

  // Import timezone-agnostic date utilities

  // Check for duplicate orders with same broker load# and pickup date
  const checkForDuplicates = async () => {
    if (!brokerLoadNumber?.trim()) return [];
    const pickups = pickupsDrops.filter((item) => item.type === "pickup");
    if (pickups.length === 0 || !pickups[0].dateRange?.from) return [];
    const pickupDate = pickups[0].dateRange.from;
    const pickupDateStr = pickupDate.toISOString().split("T")[0]; // YYYY-MM-DD format

    // Query for orders with same broker load number
    const { data: existingOrders, error } = await supabase
      .from("orders")
      .select("id, internal_load_number, broker_load_number, pickup_datetime, status")
      .eq("broker_load_number", brokerLoadNumber.trim())
      .not("status", "eq", "canceled");
    if (error) {
      console.error("Error checking for duplicate orders:", error);
      return [];
    }
    if (!existingOrders || existingOrders.length === 0) return [];

    // Filter orders with the same pickup date
    const duplicates = existingOrders.filter((order) => {
      if (!order.pickup_datetime) return false;
      const orderPickupDate = new Date(order.pickup_datetime).toISOString().split("T")[0];
      return orderPickupDate === pickupDateStr;
    });
    return duplicates;
  };
  const validatePickupDropData = () => {
    const missingData: Array<{
      location: string;
      type: "pickup" | "delivery";
      missingFields: string[];
    }> = [];
    pickupsDrops.forEach((item, index) => {
      const missing: string[] = [];
      const parsed = parseAddress(item.address || "");
      const city = item.city || parsed.city;
      const state = item.state || parsed.state;
      const hasDateTime = item.dateRange?.from && item.startTime;
      if (!city) missing.push("City");
      if (!state) missing.push("State");
      if (!hasDateTime) missing.push("Date/Time");
      if (missing.length > 0) {
        // Build full address string
        const fullAddress =
          item.city || item.state || item.zipCode
            ? `${item.address}${item.city ? `, ${item.city}` : ""}${item.state ? `, ${item.state}` : ""}${item.zipCode ? ` ${item.zipCode}` : ""}`
            : item.address || `${item.type} ${index + 1}`;
        missingData.push({
          location: fullAddress,
          type: item.type,
          missingFields: missing,
        });
      }
    });
    return missingData;
  };
  const handleSubmit = async (e: React.FormEvent, skipDuplicateCheck = false, skipDuplicateStopsCheck = false) => {
    e.preventDefault();

    // CRITICAL: Prevent duplicate submissions with debouncing
    if (isSubmitting) {
      console.log("⛔ Form submission already in progress, blocking duplicate submission");
      toast({
        title: "Please Wait",
        description: "Order is being created. Please do not submit again.",
        variant: "default",
      });
      return;
    }

    // Set submitting flag IMMEDIATELY to prevent race conditions from double-clicks
    setIsSubmitting(true);

    // CRITICAL: Validate pickup/drop data before submission (unless pending from missing data confirmation)
    if (!pendingSubmit) {
      const missingData = validatePickupDropData();
      if (missingData.length > 0) {
        setMissingDataDetails(missingData);
        setShowMissingDataDialog(true);
        setPendingSubmit(true);
        setIsSubmitting(false);
        return;
      }
    }

    // Check for potential duplicate stops (same address within 1 hour)
    if (!skipDuplicateStopsCheck && !pendingSubmit) {
      const potentialDuplicates: any[] = [];
      const addressMap = new Map<string, any[]>();

      pickupsDrops.forEach((stop, index) => {
        const key = `${stop.type}|${stop.address?.toLowerCase().trim()}|${stop.city?.toLowerCase().trim()}|${stop.state}`;
        if (!addressMap.has(key)) {
          addressMap.set(key, []);
        }
        addressMap.get(key)!.push({ ...stop, index: index + 1 });
      });

      addressMap.forEach((stops, key) => {
        if (stops.length > 1) {
          // Check if they're within 1 hour of each other or have no time set
          const times = stops.map((s) => (s.dateRange?.from ? new Date(s.dateRange.from).getTime() : 0));
          const maxTimeDiff = Math.max(...times) - Math.min(...times);
          const oneHourMs = 60 * 60 * 1000;

          if (maxTimeDiff <= oneHourMs || times.every((t) => t === 0)) {
            const [type, address, city, state] = key.split("|");
            potentialDuplicates.push({
              type,
              address,
              city,
              state,
              companyName: stops[0].companyName,
              datetime: stops[0].dateRange?.from,
              indices: stops.map((s) => s.index),
            });
          }
        }
      });

      if (potentialDuplicates.length > 0) {
        console.log("⚠️ Potential duplicate stops detected:", potentialDuplicates);
        setDuplicateStops(potentialDuplicates);
        setShowDuplicateStopsDialog(true);
        setPendingSubmit(true);
        setIsSubmitting(false);
        return;
      }
    }

    // Validation checks
    if (!isPartial && !bookedByCompany) {
      toast({
        title: "Booked by Company Required",
        description: "Please select a booked by company.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }
    
    // For partial loads, validate that at least one company is selected
    if (isPartial) {
      const hasAnyCompany = bookedByCompanies.slice(0, partialCount).some(c => c);
      if (!hasAnyCompany) {
        toast({
          title: "Company Required",
          description: "Please select at least one company for the partial loads.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    }
    
    if (!isPartial && !brokerLoadNumber?.trim()) {
      toast({
        title: "Broker Load# Required",
        description: "Please enter a broker load number.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }
    
    // For partial loads, validate that at least one broker load number is entered
    if (isPartial) {
      const hasAnyLoadNumber = brokerLoadNumbers.slice(0, partialCount).some(n => n?.trim());
      if (!hasAnyLoadNumber) {
        toast({
          title: "Broker Load# Required",
          description: "Please enter at least one broker load number for the partial loads.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    }
    
    if (!isPartial && !broker) {
      toast({
        title: "Broker Required",
        description: "Please select a broker.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }
    
    // For partial loads, validate that at least one broker is selected
    if (isPartial) {
      const hasAnyBroker = brokers.slice(0, partialCount).some(b => b);
      if (!hasAnyBroker) {
        toast({
          title: "Broker Required",
          description: "Please select at least one broker for the partial loads.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    }
    
    if (!truck) {
      toast({
        title: "Truck# Required",
        description: "Please select a truck.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Validate pickup addresses and date/time ranges
    const pickups = pickupsDrops.filter((item) => item.type === "pickup");
    if (pickups.length === 0) {
      toast({
        title: "Pickup Required",
        description: "Please add at least one pickup location.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }
    for (const pickup of pickups) {
      if (!pickup.address?.trim()) {
        toast({
          title: "Pickup Address Required",
          description: "Please enter an address for all pickup locations.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      if (!pickup.dateRange?.from) {
        toast({
          title: "Pickup Date Required",
          description: "Please select a date range for all pickup locations.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      if (!pickup.startTime?.trim() || !pickup.endTime?.trim()) {
        toast({
          title: "Pickup Time Required",
          description: "Please enter start and end times for all pickup locations.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    }

    // Validate delivery addresses and date/time ranges
    const deliveries = pickupsDrops.filter((item) => item.type === "delivery");
    if (deliveries.length === 0) {
      toast({
        title: "Delivery Required",
        description: "Please add at least one delivery location.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }
    for (const delivery of deliveries) {
      if (!delivery.address?.trim()) {
        toast({
          title: "Delivery Address Required",
          description: "Please enter an address for all delivery locations.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      if (!delivery.dateRange?.from) {
        toast({
          title: "Delivery Date Required",
          description: "Please select a date range for all delivery locations.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      if (!delivery.startTime?.trim() || !delivery.endTime?.trim()) {
        toast({
          title: "Delivery Time Required",
          description: "Please enter start and end times for all delivery locations.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    }
    if (!freightAmount?.trim() || parseFloat(freightAmount) <= 0) {
      toast({
        title: "Freight Amount Required",
        description: "Please enter a valid freight amount.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }
    if (!loadedMiles?.trim() || parseInt(loadedMiles) <= 0) {
      toast({
        title: "Total Miles Required",
        description: "Please enter valid total miles (loaded miles).",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }
    if (!driver1) {
      toast({
        title: "Driver Required",
        description: "Please select a driver. The internal load number is based on the driver's company.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Check if miles changed significantly from auto-calculated values
    if (autoCalcLoadedMilesRef.current !== null || autoCalcDhMilesRef.current !== null) {
      const oldDh = autoCalcDhMilesRef.current ?? 0;
      const newDh = parseInt(dhMiles) || 0;
      const oldLoaded = autoCalcLoadedMilesRef.current ?? 0;
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
        setPendingMilesSubmitEvent(e);
        setPendingMilesSkipDuplicate(skipDuplicateCheck);
        setPendingMilesSkipDuplicateStops(skipDuplicateStopsCheck);
        setShowMilesChangeDialog(true);
        setIsSubmitting(false);
        return;
      }
    }

    // Check for duplicates unless explicitly skipped
    if (!skipDuplicateCheck) {
      const duplicates = await checkForDuplicates();
      if (duplicates.length > 0) {
        setDuplicateOrders(duplicates);
        setShowDuplicateWarning(true);
        setIsSubmitting(false);
        return;
      }
    }
    setPendingSubmit(false);

    try {
      // Default to BF Prime LLC if booked by company is not selected
      const bfPrimeCompany = companies?.find((c) => c.name === "BF Prime");
      const finalBookedByCompany = bookedByCompany || bfPrimeCompany?.id || null;

      // Create order data object for the atomic function
      const orderData = {
        load_number: isPartial 
          ? brokerLoadNumbers.slice(0, partialCount).filter(Boolean).join(", ") || `AUTO-${Date.now()}`
          : brokerLoadNumber || `AUTO-${Date.now()}`,
        company_id: driverCompanyId,
        // Driver's company for internal load numbering
        booked_by_company_id: isPartial ? null : (bookedByCompany || bfPrimeCompany?.id || null),
        // Company that booked the order (defaults to BF Prime LLC)
        broker_id: isPartial ? null : (broker || null),
        truck_id: truck || null,
        trailer_id: truck && trucks ? trucks.find((t) => t.id === truck)?.trailer_id || null : null,
        driver1_id: driver1 || null,
        driver2_id: driver2 || null,
        broker_load_number: isPartial ? null : (brokerLoadNumber || null),
        // Partial load fields
        is_partial: isPartial,
        partial_broker_loads: isPartial 
          ? JSON.stringify(brokerLoadNumbers.slice(0, partialCount).filter(Boolean))
          : null,
        partial_brokers: isPartial 
          ? JSON.stringify(brokers.slice(0, partialCount).filter(Boolean))
          : null,
        partial_booked_by_companies: isPartial 
          ? JSON.stringify(bookedByCompanies.slice(0, partialCount).filter(Boolean))
          : null,
        pickup_datetime: (() => {
          const allPickups = pickupsDrops.filter((item) => item.type === "pickup");
          const firstPickup = allPickups[0];
          if (firstPickup?.dateRange?.from && firstPickup?.startTime) {
            return combineDateAndTime(firstPickup.dateRange.from, firstPickup.startTime);
          }
          return null;
        })(),
        pickup_end_datetime: (() => {
          const allPickups = pickupsDrops.filter((item) => item.type === "pickup");
          const lastPickup = allPickups[allPickups.length - 1];
          if (lastPickup?.dateRange?.from && lastPickup?.endTime) {
            return combineDateAndTime(lastPickup.dateRange.from, lastPickup.endTime);
          }
          return null;
        })(),
        delivery_datetime: (() => {
          const allDeliveries = pickupsDrops.filter((item) => item.type === "delivery");
          const firstDelivery = allDeliveries[0];
          if (firstDelivery?.dateRange?.from && firstDelivery?.startTime) {
            return combineDateAndTime(firstDelivery.dateRange.from, firstDelivery.startTime);
          }
          return null;
        })(),
        delivery_end_datetime: (() => {
          const allDeliveries = pickupsDrops.filter((item) => item.type === "delivery");
          const lastDelivery = allDeliveries[allDeliveries.length - 1];
          if (lastDelivery?.dateRange?.from && lastDelivery?.endTime) {
            return combineDateAndTime(lastDelivery.dateRange.from, lastDelivery.endTime);
          }
          return null;
        })(),
        freight_amount: freightAmount ? parseFloat(freightAmount) : null,
        driver_price: driverPrice ? parseFloat(driverPrice) : null,
        tonu: tonu ? parseFloat(tonu) : null,
        loaded_miles: loadedMiles ? parseInt(loadedMiles) : null,
        dh_miles: dhMiles ? parseInt(dhMiles) : null,
        mileage: (parseInt(dhMiles) || 0) + (parseInt(loadedMiles) || 0) || null,
        commodity: commodity || null,
        weight: weight ? parseFloat(weight) : null,
        reference_number: pickupPuNumber || null,
        po_number: pickupPoNumber || deliveryPoNumber || null,
        pu_number: pickupPuNumber || null,
        booked_by: profile?.full_name || "Unknown User",
      };

      // Log order data for debugging
      console.log("📝 Creating order with data:", {
        ...orderData,
        company_id: driverCompanyId,
        driver_company: selectedDriver1?.company?.name,
      });

      // Validate company_id exists
      if (!driverCompanyId) {
        throw new Error(
          "Cannot create order: Selected driver has no company assigned. Please select a different driver or assign a company to this driver.",
        );
      }

      // Use the atomic function to create order with unique internal load number
      const { data: result, error: rpcError } = (await supabase.rpc("create_order_with_unique_load_number", {
        order_data: orderData,
      })) as {
        data: {
          id: string;
          internal_load_number: number;
        };
        error: any;
      };

      if (rpcError) {
        console.error("❌ RPC Error:", rpcError);
        throw new Error(`Database error: ${rpcError.message || "Failed to create order"}`);
      }

      if (!result?.id) {
        throw new Error("Order creation failed: No order ID returned");
      }
      const orderId = result.id;
      const newInternalLoadNumber = result.internal_load_number;
      
      // Store the created order ID for email logging
      setCreatedOrderId(orderId);

      // CRITICAL: Insert pickup/drop locations IMMEDIATELY after order creation
      // This must happen before file uploads to prevent orphaned orders if uploads fail/timeout
      if (pickupsDrops.length === 0) {
        throw new Error("Cannot create order without pickup/delivery locations");
      }
      
      // Geocode any addresses that don't have coordinates yet (handles race condition with useEffect)
      const pickupDropData = await Promise.all(
        pickupsDrops
          .filter((item) => item.address?.trim())
          .map(async (item, index) => {
            // Ensure datetime fields are valid
            let datetime = null;
            let end_datetime = null;
            try {
              if (item.dateRange?.from && item.startTime) {
                datetime = combineDateAndTime(item.dateRange.from, item.startTime);
              }
              if (item.dateRange?.from && item.endTime) {
                end_datetime = combineDateAndTime(item.dateRange.from, item.endTime);
              }
            } catch (error) {
              console.error("Error combining date and time:", error);
            }
            
            // Geocode if coordinates are missing
            let latitude = item.latitude || null;
            let longitude = item.longitude || null;
            
            if (!latitude || !longitude) {
              const fullAddress = [item.address, item.city, item.state, item.zipCode]
                .filter(Boolean)
                .join(', ');
              const coords = await geocodeAddress(fullAddress);
              if (coords) {
                latitude = coords.lat;
                longitude = coords.lon;
                console.log(`📍 Geocoded at submission: ${fullAddress} -> ${latitude}, ${longitude}`);
              }
            }
            
            return {
              order_id: orderId,
              type: item.type,
              sequence_number: index + 1,
              address: item.address,
              city: item.city || null,
              state: item.state || null,
              zip_code: item.zipCode || null,
              company_name: item.companyName || null,
              datetime,
              end_datetime,
              latitude,
              longitude,
            };
          })
      );
      
      // Filter out any invalid items after async mapping
      const validPickupDropData = pickupDropData.filter((item) => item.address && item.address.trim().length > 0);

      console.log(`📍 Prepared ${validPickupDropData.length} pickup/drop locations for insertion:`, validPickupDropData);

      // CRITICAL: Must have at least one valid pickup/drop after filtering
      if (validPickupDropData.length === 0) {
        throw new Error("No valid pickup/delivery locations found. Please ensure all locations have valid addresses.");
      }
      console.log(`📍 Inserting ${validPickupDropData.length} pickup/drop locations for order ${orderId}`);
      const { error: pickupDropError } = await supabase.from("pickup_drops").insert(validPickupDropData);
      if (pickupDropError) {
        console.error("❌ Pickup/drop insert error:", pickupDropError);
        console.error("Failed data:", validPickupDropData);
        // Try to delete the orphaned order since pickup_drops failed
        await supabase.from("orders").delete().eq("id", orderId);
        throw new Error(`Failed to save pickup/delivery locations: ${pickupDropError.message}`);
      }
      console.log(`✅ Successfully inserted ${validPickupDropData.length} pickup/drop locations`);

      // Upload files if any (this happens AFTER pickup_drops are saved)
      const allFiles = [
        {
          files: isPartial ? rcFilesArray.flat() : rcFiles,
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
              orderId,
              folder: category,
              file,
            });
            const { error: fileError } = await supabase.from("order_files").insert({
              order_id: orderId,
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

      // Auto-set checked_out_at for newly uploaded BOL/POD files
      if (bolUploaded || podUploaded) {
        // Fetch all pickup_drops for this order
        const { data: allPickupDrops } = await supabase
          .from("pickup_drops")
          .select("id, type, sequence_number")
          .eq("order_id", orderId)
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
            // For new orders, we're uploading PODs for the first time
            // Update checkout times for first N deliveries where N = number of PODs uploaded
            for (let i = 0; i < newPodCount && i < deliveries.length; i++) {
              const delivery = deliveries[i];
              await supabase.from("pickup_drops").update({ checked_out_at: checkoutTimestamp }).eq("id", delivery.id);
            }
            
            // Auto-set status to "delivered" when all deliveries have PODs
            if (newPodCount >= deliveries.length && orderId) {
              await supabase
                .from("orders")
                .update({ status: "delivered" })
                .eq("id", orderId);
            }
          }
        }
      }

      toast({
        title: "Load Created",
        description: `Load ${formatInternalLoadNumber(newInternalLoadNumber, selectedDriver1?.company?.name)} has been successfully created.`,
      });

      // Invalidate query cache to refetch next internal load number
      queryClient.invalidateQueries({
        queryKey: ["nextInternalLoadNumber"],
      });

      // Force Orders list to reload next time it's opened (orders query is cached indefinitely)
      queryClient.removeQueries({ queryKey: ["orders"] });

      // Reset form and refetch next internal load number
      setBrokerLoadNumber("");
      setBroker("");

      // Redirect to orders page
      navigate("/orders");
      setTruck("");
      setDriver1("");
      setDriver2("");
      setTrailer("");
      setPickupDateRange(undefined);
      setDeliveryDateRange(undefined);
      setFreightAmount("");
      setDriverPrice("");
      setTonu("");
      setDhMiles("");
      setLoadedMiles("");
      setRcFiles([]);
      setBolFiles([]);
      setPodFiles([]);
      setAdditionalFiles([]);
      const rcInput = document.getElementById("rc-files") as HTMLInputElement;
      const bolInput = document.getElementById("bol-files") as HTMLInputElement;
      const podInput = document.getElementById("pod-files") as HTMLInputElement;
      const additionalInput = document.getElementById("additional-files") as HTMLInputElement;
      if (rcInput) rcInput.value = "";
      if (bolInput) bolInput.value = "";
      if (podInput) podInput.value = "";
      if (additionalInput) additionalInput.value = "";
      setPickupsDrops([
        {
          id: "pickup-1",
          type: "pickup",
          address: "",
          datetime: "",
          dateRange: undefined,
          startTime: "",
          endTime: "",
        },
        {
          id: "delivery-1",
          type: "delivery",
          address: "",
          datetime: "",
          dateRange: undefined,
          startTime: "",
          endTime: "",
        },
      ]);
    } catch (error: any) {
      console.error("Error creating order:", error);

      // Show detailed error message
      const errorMessage = error.message || "Failed to create order. Please try again.";
      const isPickupDropError =
        errorMessage.toLowerCase().includes("pickup") ||
        errorMessage.toLowerCase().includes("delivery") ||
        errorMessage.toLowerCase().includes("location");
      toast({
        title: isPickupDropError ? "Invalid Pickup/Delivery Data" : "Error Creating Order",
        description: errorMessage,
        variant: "destructive",
        duration: 8000,
      });
      setIsSubmitting(false);
    }
  };
  const handleConfirmMissingData = (e?: React.MouseEvent) => {
    if (isSubmitting) return; // Prevent duplicate submissions
    setShowMissingDataDialog(false);
    setPendingSubmit(true);
    // Call handleSubmit directly instead of dispatching synthetic event
    handleSubmit(e as any);
  };
  const isLoading = companiesLoading || trucksLoading || driversLoading || loadingNextNumber;
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }
  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-semibold">Create New Load</CardTitle>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Internal Load #</div>
              <div className="text-lg font-medium">{formatInternalLoadNumber(nextInternalLoadNumber, selectedDriver1?.company?.name)}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* RC Upload Section - Top Priority */}
            {!isPartial && (
            <Card
              className={cn(
                "bg-blue-50/50 border-blue-200 transition-all duration-200 cursor-pointer",
                dragStates.rc && "border-blue-400 bg-blue-100/50 scale-[1.02]",
              )}
              {...rcDragHandlers}
              onClick={() => rcFileInputRef.current?.click()}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-blue-700 flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  RC (Rate Confirmation) Upload
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-blue-700">
                      {rcFiles && rcFiles.length > 0
                        ? `${rcFiles.length} file(s) selected`
                        : "Click or drag files here to upload"}
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExtractWithAI();
                      }}
                      disabled={
                        isExtracting ||
                        !rcFiles ||
                        rcFiles.length === 0 ||
                        !Array.from(rcFiles || []).some((f) => f.type === "application/pdf")
                      }
                      className="gap-2 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                      data-ai-extract="true"
                    >
                      <Sparkles className="h-4 w-4" />
                      {isExtracting ? "Extracting..." : "Extract with AI"}
                    </Button>
                  </div>

                  {dragStates.rc && (
                    <div className="border-2 border-dashed border-blue-400 rounded-lg p-6 text-center bg-blue-50">
                      <FileText className="mx-auto h-8 w-8 text-blue-500 mb-2" />
                      <p className="text-sm text-blue-600 font-medium">Drop your files here</p>
                    </div>
                  )}

                  {!dragStates.rc && rcFiles.length > 0 && (
                    <div className="space-y-2">
                      {rcFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 bg-white rounded border border-blue-200"
                        >
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span className="text-sm text-gray-700 truncate">{file.name}</span>
                          <span className="text-xs text-gray-500">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {!dragStates.rc && rcFiles.length === 0 && (
                    <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center bg-white hover:bg-blue-50/30 transition-colors">
                      <FileText className="mx-auto h-8 w-8 text-blue-400 mb-2" />
                      <p className="text-sm text-blue-600 font-medium mb-1">Click or drag & drop files here</p>
                      <p className="text-xs text-blue-500">PDF, JPG, JPEG, PNG files supported</p>
                    </div>
                  )}

                  <input
                    ref={rcFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setRcFiles(e.target.files ? Array.from(e.target.files) : [])}
                  className="hidden"
                />
              </div>
            </CardContent>
          </Card>
          )}

          <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="broker-load-number">Broker Load #</Label>
                {!isPartial ? (
                  <Input
                    id="broker-load-number"
                    placeholder="Broker load number"
                    value={brokerLoadNumber}
                    onChange={(e) => setBrokerLoadNumber(e.target.value)}
                  />
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: partialCount }).map((_, index) => (
                      <Input
                        key={index}
                        placeholder={`Load #${index + 1}`}
                        value={brokerLoadNumbers[index]}
                        onChange={(e) => {
                          const newNumbers = [...brokerLoadNumbers];
                          newNumbers[index] = e.target.value;
                          setBrokerLoadNumbers(newNumbers);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-end gap-2 pt-8">
                <div className="flex items-center gap-2">
                  <Label htmlFor="partial-toggle" className="text-sm font-medium cursor-pointer">
                    Partial Load
                  </Label>
                  <Switch
                    id="partial-toggle"
                    checked={isPartial}
                    onCheckedChange={(checked) => {
                      setIsPartial(checked);
                      if (checked) {
                        // Always show dialog to select count when enabling partial
                        const count = window.prompt("How many partial loads? (2-4)", partialCount.toString());
                        const num = parseInt(count || partialCount.toString());
                        if (num >= 2 && num <= 4) {
                          setPartialCount(num);
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Partial loads - Multiple RC uploads and broker/company sections */}
            {isPartial && (
              <div className="space-y-4">
                <div className={cn(
                  "grid gap-4",
                  partialCount === 2 ? "grid-cols-1 md:grid-cols-2" : 
                  partialCount === 3 ? "grid-cols-1 md:grid-cols-3" :
                  "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
                )}>
                  {Array.from({ length: partialCount }).map((_, index) => {
                    const dragActive = partialDragStates[index];
                    
                    const handleDrag = (e: React.DragEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    };
                    
                    const handleDragIn = (e: React.DragEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                        const newStates = [...partialDragStates];
                        newStates[index] = true;
                        setPartialDragStates(newStates);
                      }
                    };
                    
                    const handleDragOut = (e: React.DragEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newStates = [...partialDragStates];
                      newStates[index] = false;
                      setPartialDragStates(newStates);
                    };
                    
                    const handleFileDrop = (e: React.DragEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newStates = [...partialDragStates];
                      newStates[index] = false;
                      setPartialDragStates(newStates);
                      
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length > 0) {
                        const newArray = [...rcFilesArray];
                        newArray[index] = files as File[];
                        setRcFilesArray(newArray);
                      }
                    };
                    
                    return (
                      <Card key={index} className="border-2">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm text-blue-700 flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            Partial {index + 1}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* RC Upload for this partial with drag & drop */}
                          <div 
                            className={cn(
                              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-blue-50/30 transition-colors",
                              dragActive && "border-blue-500 bg-blue-50",
                              !dragActive && rcFilesArray[index]?.length > 0 && "border-blue-400 bg-blue-50/50",
                              !dragActive && (!rcFilesArray[index] || rcFilesArray[index].length === 0) && "border-blue-300"
                            )}
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.multiple = true;
                              input.accept = '.pdf,.jpg,.jpeg,.png';
                              input.onchange = (e: any) => {
                                const files = Array.from(e.target.files || []);
                                const newArray = [...rcFilesArray];
                                newArray[index] = files as File[];
                                setRcFilesArray(newArray);
                              };
                              input.click();
                            }}
                            onDragEnter={handleDragIn}
                            onDragLeave={handleDragOut}
                            onDragOver={handleDrag}
                            onDrop={handleFileDrop}
                          >
                            <FileText className="mx-auto h-8 w-8 text-blue-400 mb-2" />
                            <p className="text-sm text-blue-600 font-medium">
                              {dragActive 
                                ? 'Drop files here'
                                : rcFilesArray[index]?.length > 0 
                                  ? `${rcFilesArray[index].length} file(s)` 
                                  : 'Click or drag & drop'}
                            </p>
                            {!dragActive && (!rcFilesArray[index] || rcFilesArray[index].length === 0) && (
                              <p className="text-xs text-blue-500 mt-1">PDF, JPG, PNG supported</p>
                            )}
                          </div>
                        
                        {/* Company selector */}
                        <div className="space-y-1">
                          <Label className="text-xs">Company</Label>
                          <Combobox
                            options={companyOptions}
                            value={bookedByCompanies[index]}
                            onValueChange={(val) => {
                              const newCompanies = [...bookedByCompanies];
                              newCompanies[index] = val;
                              setBookedByCompanies(newCompanies);
                            }}
                            placeholder="Select"
                            searchPlaceholder="Search..."
                          />
                        </div>
                        
                        {/* Broker selector */}
                        <div className="space-y-1">
                          <Label className="text-xs">Broker</Label>
                          <BrokerCombobox
                            value={brokers[index]}
                            onValueChange={(val) => {
                              const newBrokers = [...brokers];
                              newBrokers[index] = val;
                              setBrokers(newBrokers);
                            }}
                            placeholder="Select"
                            searchPlaceholder="Search..."
                          />
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
                
                {/* Extract button for partial loads */}
                {rcFilesArray.some(arr => arr.length > 0) && (
                  <Button
                    type="button"
                    onClick={handleExtractWithAI}
                    disabled={isExtracting}
                    variant="outline"
                    className="w-full border-blue-500 text-blue-700 hover:bg-blue-50"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extracting from {rcFilesArray.flat().length} files...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Extract Data from All RC Files
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Error handling for data loading */}
            {(companiesError || trucksError) && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <div>
                    {companiesError && trucksError ? (
                      <>Failed to load companies and trucks. This may be due to a slow or unstable connection.</>
                    ) : companiesError ? (
                      <>Failed to load companies. This may be due to a slow or unstable connection.</>
                    ) : (
                      <>Failed to load trucks. This may be due to a slow or unstable connection.</>
                    )}
                    {companiesLoading || trucksLoading ? " Retrying..." : ""}
                  </div>
                  {!companiesLoading && companiesError && (
                    <Button variant="outline" size="sm" onClick={() => refetchCompanies()} className="ml-2">
                      Retry Now
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {!isPartial && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Booked by Company</Label>
                  <Combobox
                    options={companyOptions}
                    value={bookedByCompany}
                    onValueChange={setBookedByCompany}
                    placeholder={
                      companiesLoading
                        ? "Loading companies..."
                        : companiesError
                          ? "Error loading companies"
                          : "Select company"
                    }
                    searchPlaceholder="Search companies..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broker">Broker</Label>
                  <BrokerCombobox
                    value={broker}
                    onValueChange={setBroker}
                    placeholder="Select broker"
                    searchPlaceholder="Search brokers..."
                  />
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
                  placeholder={
                    trucksLoading ? "Loading trucks..." : trucksError ? "Error loading trucks" : "Select truck"
                  }
                  searchPlaceholder="Search trucks..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailer">Trailer # (Auto-filled)</Label>
                <Input
                  id="trailer"
                  placeholder="Trailer number"
                  value={trailer}
                  onChange={(e) => {
                    setTrailer(e.target.value);
                    setTrailerManuallyEdited(true);
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="driver1">Driver 1 (Auto-filled)</Label>
                <Combobox
                  options={driverOptions}
                  value={driver1}
                  onValueChange={setDriver1}
                  placeholder="Select primary driver"
                  searchPlaceholder="Search drivers..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver2">Driver 2 (Optional, Auto-filled)</Label>
                <Combobox
                  options={[
                    {
                      value: "",
                      label: "None",
                    },
                    ...driverOptions,
                  ]}
                  value={driver2}
                  onValueChange={setDriver2}
                  placeholder="Select second driver"
                  searchPlaceholder="Search drivers..."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Additional Pickups & Deliveries</Label>
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
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                      {pickupsDrops.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn("p-4", snapshot.isDragging && "shadow-lg")}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div {...provided.dragHandleProps}>
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  </div>
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
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removePickupDrop(item.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label htmlFor={`address-${item.id}`}>Street Address</Label>
                                  <Input
                                    id={`address-${item.id}`}
                                    placeholder="123 Main St"
                                    value={item.address}
                                    onChange={(e) => updatePickupDrop(item.id, "address", e.target.value)}
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
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label htmlFor={`state-${item.id}`}>State</Label>
                                    <Select
                                      value={item.state || ""}
                                      onValueChange={(value) => updatePickupDrop(item.id, "state", value)}
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
                                        // Format zip code with dash after 5th digit if needed
                                        const formatted = formatZipCode(e.target.value);
                                        updatePickupDrop(item.id, "zipCode", formatted);
                                      }}
                                      maxLength={10}
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
                                  />
                                </div>
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dh-miles">
                  DH Miles
                  {isCalculatingDhMiles && <span className="text-xs text-muted-foreground ml-2">(Calculating...)</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="dh-miles"
                    type="number"
                    placeholder={lastDelivery ? "Auto-calculated from last delivery" : "0"}
                    value={dhMiles}
                    onChange={(e) => setDhMiles(e.target.value)}
                    disabled={isCalculatingDhMiles}
                    className={cn(isCalculatingDhMiles && "bg-muted cursor-not-allowed")}
                  />
                  {isCalculatingDhMiles && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {lastDelivery && dhMiles && !isCalculatingDhMiles
                    ? `From: ${lastDelivery.deliveryAddress}`
                    : "\u00A0"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loaded-miles">
                  Loaded Miles
                  {isCalculatingMiles && <span className="text-xs text-muted-foreground ml-2">(Calculating...)</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="loaded-miles"
                    type="number"
                    placeholder="0"
                    value={loadedMiles}
                    onChange={(e) => setLoadedMiles(e.target.value)}
                    disabled={isCalculatingMiles}
                    className={cn(isCalculatingMiles && "bg-muted cursor-not-allowed")}
                  />
                  {isCalculatingMiles && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Auto-calculated from pickup to delivery addresses</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="total-miles">Total Miles</Label>
                <div className="relative">
                  <Input
                    id="total-miles"
                    type="number"
                    placeholder="0"
                    value={((parseFloat(dhMiles) || 0) + (parseFloat(loadedMiles) || 0)).toString()}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <p className="text-xs text-muted-foreground min-h-[1.25rem]"></p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="freight-amount">Freight Amount</Label>
                <Input
                  id="freight-amount"
                  type="number"
                  placeholder="0.00"
                  value={freightAmount}
                  onChange={(e) => setFreightAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  RPM: $
                  {(
                    (parseFloat(freightAmount) || 0) / ((parseFloat(dhMiles) || 0) + (parseFloat(loadedMiles) || 0)) ||
                    0
                  ).toFixed(2)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-price">Price for Driver</Label>
                <Input
                  id="driver-price"
                  type="number"
                  placeholder="0.00"
                  value={driverPrice}
                  onChange={(e) => setDriverPrice(e.target.value)}
                />
                {(() => {
                  const selectedDriver = allDrivers?.find(d => d.id === driver1);
                  const totalMiles = (parseFloat(dhMiles) || 0) + (parseFloat(loadedMiles) || 0);
                  if (selectedDriver?.is_company_driver && selectedDriver?.cents_per_mile) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        {totalMiles} miles × {selectedDriver.cents_per_mile}¢ = ${((totalMiles * selectedDriver.cents_per_mile) / 100).toFixed(2)}
                      </p>
                    );
                  }
                  return (
                    <p className="text-xs text-muted-foreground">
                      RPM: $
                      {(
                        (parseFloat(driverPrice) || 0) / totalMiles || 0
                      ).toFixed(2)}
                    </p>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tonu">TONU</Label>
                <Input
                  id="tonu"
                  type="number"
                  placeholder="0.00"
                  value={tonu}
                  onChange={(e) => {
                    setTonu(e.target.value);
                    // If TONU has a value, set freight amount to 0
                    if (e.target.value && parseFloat(e.target.value) > 0) {
                      setFreightAmount("0");
                    }
                  }}
                />
              </div>
            </div>

            {/* Additional File Upload Sections */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  dragStates.bol && "border-green-400 bg-green-50/50 scale-[1.02]",
                )}
                {...bolDragHandlers}
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
                        {bolFiles.length > 0 ? `${bolFiles.length} file(s) selected` : "Click or drag files here"}
                      </p>
                      {bolFiles.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {bolFiles.map((file, index) => (
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
                    onChange={(e) => setBolFiles(e.target.files ? Array.from(e.target.files) : [])}
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
                        {podFiles.length > 0 ? `${podFiles.length} file(s) selected` : "Click or drag files here"}
                      </p>
                      {podFiles.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {podFiles.map((file, index) => (
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
                    onChange={(e) => setPodFiles(e.target.files ? Array.from(e.target.files) : [])}
                    className="hidden"
                  />
                  <p className="text-xs text-purple-600">Delivery confirmation documents</p>
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  dragStates.additional && "border-orange-400 bg-orange-50/50 scale-[1.02]",
                )}
                {...additionalDragHandlers}
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
                        {additionalFiles.length > 0
                          ? `${additionalFiles.length} file(s) selected`
                          : "Click or drag files here"}
                      </p>
                      {additionalFiles.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {additionalFiles.map((file, index) => (
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
                    onChange={(e) => setAdditionalFiles(e.target.files ? Array.from(e.target.files) : [])}
                    className="hidden"
                  />
                  <p className="text-xs text-orange-600">Other supporting documents</p>
                </CardContent>
              </Card>
            </div>

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

            {/* Email to Driver File Upload */}
            <Card
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md bg-blue-50/30 border-blue-200",
                dragStates.email && "border-blue-400 bg-blue-100/50 scale-[1.02]",
              )}
              {...emailDragHandlers}
              onClick={() => emailFileInputRef.current?.click()}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-blue-700 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email to Driver
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dragStates.email ? (
                  <div className="border-2 border-dashed border-blue-400 rounded-lg p-4 text-center bg-blue-50">
                    <FileText className="mx-auto h-6 w-6 text-blue-500 mb-1" />
                    <p className="text-xs text-blue-600 font-medium">Drop files here</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-blue-600 mb-2">
                      {emailFiles.length > 0 ? `${emailFiles.length} file(s) selected` : "Click or drag files here"}
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
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setEmailFiles(e.target.files ? Array.from(e.target.files) : [])}
                  className="hidden"
                />
                <p className="text-xs text-blue-600">Upload file to email to driver</p>

                {/* Send Email Button */}
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSendEmailToDriver();
                  }}
                  disabled={emailFiles.length === 0 || isSendingEmail || emailSent || !driver1}
                  className={cn("w-full mt-2", emailSent && "bg-green-600 hover:bg-green-700")}
                >
                  {isSendingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {emailSent ? (
                    <>✓ Sent to {drivers?.find((d) => d.id === driver1)?.email || "driver"}</>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Email to Driver
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate("/orders")}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || isExtracting || isCalculatingMiles}
                className={cn(isSubmitting && "opacity-50 cursor-not-allowed")}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Creating Load..." : "Create Load"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Duplicate Order Warning Dialog */}
      <AlertDialog open={showDuplicateWarning} onOpenChange={setShowDuplicateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Load Warning</AlertDialogTitle>
            <AlertDialogDescription>
              A load with the same Broker Load# <strong>({brokerLoadNumber})</strong> and pickup date already exists in
              the system:
              <div className="mt-3 space-y-2">
                {duplicateOrders.map((order) => (
                  <div key={order.id} className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <div className="font-medium">Internal Load #{order.internal_load_number}</div>
                    <div className="text-sm">Status: {order.status}</div>
                    <div className="text-sm">
                      Pickup: {order.pickup_datetime ? new Date(order.pickup_datetime).toLocaleDateString() : "N/A"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">Are you sure you want to create this load anyway?</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDuplicateWarning(false);
                setDuplicateOrders([]);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              className={cn(isSubmitting && "opacity-50 cursor-not-allowed")}
              onClick={(e) => {
                if (isSubmitting) {
                  console.log("⛔ Already submitting, blocking duplicate dialog action");
                  return;
                }
                setShowDuplicateWarning(false);
                handleSubmit(e as any, true);
              }}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Creating..." : "Create Anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Missing Data Confirmation Dialog */}
      <MissingDataConfirmDialog
        open={showMissingDataDialog}
        onOpenChange={setShowMissingDataDialog}
        missingData={missingDataDetails}
        onConfirm={handleConfirmMissingData}
      />

      {/* Duplicate Stops Confirmation Dialog */}
      <DuplicateStopsConfirmDialog
        open={showDuplicateStopsDialog}
        duplicates={duplicateStops}
        onCancel={() => {
          setShowDuplicateStopsDialog(false);
          setPendingSubmit(false);
        }}
        onConfirm={(e) => {
          if (isSubmitting) {
            console.log("⛔ Already submitting, blocking duplicate stops dialog action");
            return;
          }
          setShowDuplicateStopsDialog(false);
          setPendingSubmit(true);
          // Call handleSubmit directly with skipDuplicateStopsCheck flag
          handleSubmit(e as any, false, true);
        }}
        isSubmitting={isSubmitting}
      />

      {/* Miles Change Reason Dialog */}
      <MilesChangeReasonDialog
        open={showMilesChangeDialog}
        onConfirm={async (reason) => {
          setShowMilesChangeDialog(false);
          // Send SMS notification
           const phoneNumbers = getMilesChangeSmsRecipients(profile?.office);
           if (phoneNumbers.length > 0 && milesChangeInfo) {
             const companyName = selectedDriver1?.company?.name || companies?.find(c => c.id === driverCompanyId)?.name;
             const ilnDisplay = nextInternalLoadNumber
               ? formatInternalLoadNumber(nextInternalLoadNumber, companyName)
               : "N/A";
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
          // Continue with submission
          if (pendingMilesSubmitEvent) {
            // Re-set the auto-calc refs to current values so the check won't trigger again
            autoCalcLoadedMilesRef.current = parseInt(loadedMiles) || 0;
            autoCalcDhMilesRef.current = parseInt(dhMiles) || 0;
            handleSubmit(pendingMilesSubmitEvent, pendingMilesSkipDuplicate, pendingMilesSkipDuplicateStops);
          }
        }}
        changeInfo={milesChangeInfo || { dhMilesChanged: false, loadedMilesChanged: false, oldDhMiles: 0, newDhMiles: 0, oldLoadedMiles: 0, newLoadedMiles: 0 }}
      />
    </div>
  );
};
export default NewOrder;
