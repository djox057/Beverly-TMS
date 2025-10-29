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
import { Plus, Trash2, Loader2, GripVertical, Sparkles, Upload, FileText, AlertCircle, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/hooks/useCompanies";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useNextInternalLoadNumber } from "@/hooks/useNextInternalLoadNumber";
import { supabase } from "@/integrations/supabase/client";
import { parseAddress } from "@/utils/addressParser";
import { useToast } from "@/components/ui/use-toast";
import { useAuthContext } from "@/contexts/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { calculateLoadedMiles, calculateDhMiles, calculateMultiStopMiles } from "@/utils/routeCalculation";
import { useTruckLastDelivery } from "@/hooks/useTruckLastDelivery";
import { combineDateAndTime } from "@/utils/dateUtils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
}

const NewOrder = () => {
  const navigate = useNavigate();
  const [bookedByCompany, setBookedByCompany] = useState("");
  const [broker, setBroker] = useState("");
  const [truck, setTruck] = useState("");
  const [driver1, setDriver1] = useState("");
  const [driver2, setDriver2] = useState("");
  const [trailer, setTrailer] = useState("");
  const [brokerLoadNumber, setBrokerLoadNumber] = useState("");
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
  const [rcFiles, setRcFiles] = useState<FileList | null>(null);
  const [bolFiles, setBolFiles] = useState<FileList | null>(null);
  const [podFiles, setPodFiles] = useState<FileList | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<FileList | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingConfirmation, setIsGeneratingConfirmation] = useState(false);
  const [isCalculatingMiles, setIsCalculatingMiles] = useState(false);
  const [isCalculatingDhMiles, setIsCalculatingDhMiles] = useState(false);
  const [hasAutoExtracted, setHasAutoExtracted] = useState(false);
  
  // Email dispatch toggle states
  const [confirmationGenerated, setConfirmationGenerated] = useState(false);
  const [generatedConfirmationBlob, setGeneratedConfirmationBlob] = useState<Blob | null>(null);
  const [generatedConfirmationFilename, setGeneratedConfirmationFilename] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
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
  
  const { toast } = useToast();
  const { profile, hasRole } = useAuthContext();
  const queryClient = useQueryClient();

  // Company email configuration
  // TEMPORARY: Using Resend's verified domain until bfprime.net domains are verified in Resend
  const COMPANY_EMAIL_CONFIG: Record<string, { sender: string; cc: string }> = {
    "BF Prime LLC": {
      sender: "BF Prime Dispatch <onboarding@resend.dev>",
      cc: "dispatch@bfprime.net"
    },
    "BF Prime United LLC": {
      sender: "BF Prime United Dispatch <onboarding@resend.dev>",
      cc: "dispatch@bfprimeunited.net"
    },
    "Beverly Group": {
      sender: "Beverly Group Dispatch <onboarding@resend.dev>",
      cc: "dispatch@beverlygroupllc.net"
    },
    "Beverly Freight": {
      sender: "Beverly Freight Dispatch <onboarding@resend.dev>",
      cc: "dispatch@beverlyfreight.net"
    },
    "BG Prime Inc": {
      sender: "BG Prime Dispatch <onboarding@resend.dev>",
      cc: "dispatch@bgprime.net"
    }
  };

  // Drag states for file uploads
  const [dragStates, setDragStates] = useState({
    rc: false,
    bol: false,
    pod: false,
    additional: false
  });

  // File input refs for programmatic access
  const rcFileInputRef = useRef<HTMLInputElement>(null);
  const bolFileInputRef = useRef<HTMLInputElement>(null);
  const podFileInputRef = useRef<HTMLInputElement>(null);
  const additionalFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch data from database with proper error handling
  const { data: companies, isLoading: companiesLoading, error: companiesError, refetch: refetchCompanies } = useCompanies();
  const { data: allTrucks, isLoading: trucksLoading, error: trucksError } = useTrucks();
  const { data: allDrivers, isLoading: driversLoading, error: driversError } = useDrivers();
  
  // Filter trucks by dispatcher for dispatch role - check driver dispatcher
  // First, get the list of driver IDs assigned to this dispatcher
  const isDispatchOnly = hasRole('dispatch') && 
                         !hasRole('manager') && 
                         !hasRole('admin') && 
                         !hasRole('afterhours') &&
                         !hasRole('accounting') &&
                         !hasRole('supervisor') &&
                         !hasRole('safety');
  
  const dispatcherDriverIds = isDispatchOnly && profile?.user_id 
    ? allDrivers?.filter(driver => driver.dispatcher_id === profile.user_id).map(d => d.id) || []
    : [];
  
  const trucks = allTrucks?.filter(truck => {
    if (profile?.user_id && isDispatchOnly) {
      // Show ONLY trucks that have a driver assigned to this dispatcher
      // Dispatch users should only see trucks from their /fleets
      return truck.driver1_id && dispatcherDriverIds.includes(truck.driver1_id);
    }
    return true;
  });
  
  // Filter drivers by dispatcher for dispatch role
  const drivers = allDrivers?.filter(driver => {
    if (profile?.user_id && isDispatchOnly) {
      // If driver has no dispatcher assigned, show to all dispatchers (so they can be assigned)
      // Otherwise, only show if dispatcher_id matches current user
      return !driver.dispatcher_id || driver.dispatcher_id === profile.user_id;
    }
    return true;
  });
  
  // Show all companies to all users for "Booked by company" dropdown
  const filteredCompanies = companies;
  
  // Get company_id from selected truck only (not from booked by company)
  const selectedTruck = trucks?.find(t => t.id === truck);
  const truckCompanyId = selectedTruck?.company_id;
  
  const { data: nextInternalLoadNumber, isLoading: loadingNextNumber } = useNextInternalLoadNumber(truckCompanyId);
  
  // Get the first pickup datetime for DH miles calculation
  const firstPickupDatetime = pickupsDrops.find(item => item.type === 'pickup')?.datetime || null;
  const { data: lastDelivery } = useTruckLastDelivery(truck || null, firstPickupDatetime);

  // Auto-extract AI when RC file is uploaded
  useEffect(() => {
    // Reset flag when files are cleared
    if (!rcFiles || rcFiles.length === 0) {
      setHasAutoExtracted(false);
      return;
    }

    // Auto-trigger extraction once when PDF is uploaded
    if (!hasAutoExtracted && !isExtracting) {
      const pdfFile = Array.from(rcFiles).find(file => file.type === 'application/pdf');
      if (pdfFile) {
        setHasAutoExtracted(true);
        handleExtractWithAI();
      }
    }
  }, [rcFiles]);

  // Pre-select BF Prime company as default
  useEffect(() => {
    console.log('🏢 Companies effect triggered', { 
      companiesCount: companies?.length, 
      bookedByCompany,
      companiesLoading,
      companiesError: companiesError?.message 
    });
    
    // Wait for companies to load and only set if not already selected
    if (!companiesLoading && companies && companies.length > 0 && !bookedByCompany) {
      const bfPrime = companies.find(c => c.name === 'BF Prime');
      if (bfPrime) {
        console.log('🏢 Auto-selecting BF Prime company:', bfPrime.id);
        setBookedByCompany(bfPrime.id);
      } else {
        console.log('🏢 BF Prime not found, available companies:', companies.map(c => c.name));
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
      endTime: ""
    };
    const defaultDelivery: PickupDrop = {
      id: "delivery-1",
      type: "delivery",
      address: "",
      datetime: "",
      dateRange: undefined,
      startTime: "",
      endTime: ""
    };
    setPickupsDrops([defaultPickup, defaultDelivery]);
  }, []);

  // Track if trailer was manually edited to prevent auto-overwrite
  const [trailerManuallyEdited, setTrailerManuallyEdited] = useState(false);

  // Auto-populate trailer and drivers when truck is selected
  useEffect(() => {
    if (truck && trucks) {
      const selectedTruck = trucks.find(t => t.id === truck);
      if (selectedTruck) {
        // Only autofill trailer if not manually edited
        if (!trailerManuallyEdited && selectedTruck.trailer?.trailer_number) {
          setTrailer(selectedTruck.trailer.trailer_number);
        }
        
        // Autofill driver IDs (use nested object if available, otherwise use direct ID)
        if (selectedTruck.driver1?.id) {
          setDriver1(selectedTruck.driver1.id);
        } else if (selectedTruck.driver1_id) {
          setDriver1(selectedTruck.driver1_id);
        } else {
          setDriver1('');
        }
        
        if (selectedTruck.driver2?.id) {
          setDriver2(selectedTruck.driver2.id);
        } else if (selectedTruck.driver2_id) {
          setDriver2(selectedTruck.driver2_id);
        } else {
          setDriver2('');
        }
      }
    } else {
      // Clear fields when truck is deselected
      setTrailer('');
      setDriver1('');
      setDriver2('');
      setTrailerManuallyEdited(false);
    }
  }, [truck, trucks, trailerManuallyEdited]);

  // Auto-calculate loaded miles when pickup and delivery addresses change
  useEffect(() => {
    const calculateMiles = async () => {
      if (pickupsDrops.length < 2) return;

      // Get all addresses in order (all pickups first, then all deliveries)
      // Combine address components for better geocoding accuracy
      const addresses = pickupsDrops
        .filter(item => item.address.trim())
        .map(item => {
          if (item.city || item.state || item.zipCode) {
            return `${item.address}${item.city ? `, ${item.city}` : ''}${item.state ? `, ${item.state}` : ''}${item.zipCode ? ` ${item.zipCode}` : ''}`;
          }
          return item.address;
        });

      if (addresses.length < 2) {
        return;
      }

      setIsCalculatingMiles(true);
      try {
        let miles: number | null = null;
        
        if (addresses.length === 2) {
          // Single pickup to single delivery
          miles = await calculateLoadedMiles(addresses[0], addresses[1]);
        } else {
          // Multi-drop route calculation
          miles = await calculateMultiStopMiles(addresses);
        }

        if (miles !== null) {
          setLoadedMiles(miles.toString());
          toast({
            title: "Loaded Miles Calculated",
            description: addresses.length > 2 
              ? `Multi-stop route distance: ${miles} miles through ${addresses.length} stops`
              : `Route distance: ${miles} miles`,
          });
        }
      } catch (error) {
        console.error('Error calculating loaded miles:', error);
        toast({
          title: "Calculation Failed",
          description: "Unable to calculate loaded miles automatically",
          variant: "destructive",
        });
      } finally {
        setIsCalculatingMiles(false);
      }
    };

    // Debounce the calculation to avoid too many API calls
    const timeoutId = setTimeout(calculateMiles, 1000);
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

      // Build full address for better geocoding accuracy
      const pickupAddress = firstPickup.city || firstPickup.state || firstPickup.zipCode
        ? `${firstPickup.address}${firstPickup.city ? `, ${firstPickup.city}` : ''}${firstPickup.state ? `, ${firstPickup.state}` : ''}${firstPickup.zipCode ? ` ${firstPickup.zipCode}` : ''}`
        : firstPickup.address;

      console.log('🚚 =================================');
      console.log('🚚 DH MILES AUTO-CALCULATION');
      console.log('🚚 =================================');
      console.log('🚚 Truck ID:', truck);
      console.log('🚚 Last Delivery Address:', lastDelivery.deliveryAddress);
      console.log('🚚 Current Pickup Address:', pickupAddress);
      console.log('🚚 Last Order ID:', lastDelivery.orderId);
      console.log('🚚 =================================');

      setIsCalculatingDhMiles(true);
      try {
        const miles = await calculateDhMiles(lastDelivery.deliveryAddress, pickupAddress);
        if (miles !== null) {
          setDhMiles(miles.toString());
          toast({
            title: "DH Miles Calculated",
            description: `Distance from last delivery: ${miles} miles`,
          });
        } else {
          setDhMiles('0');
        }
      } catch (error) {
        console.error('Error calculating DH miles:', error);
        toast({
          title: "DH Calculation Failed",
          description: "Unable to calculate DH miles automatically",
          variant: "destructive",
        });
      } finally {
        setIsCalculatingDhMiles(false);
      }
    };

    // Debounce the calculation
    const timeoutId = setTimeout(calculateDh, 1000);
    return () => clearTimeout(timeoutId);
  }, [truck, lastDelivery, pickupsDrops, toast]);

  const addPickupDrop = (type: "pickup" | "delivery") => {
    const newItem: PickupDrop = {
      id: Date.now().toString(),
      type,
      address: "",
      datetime: "",
      dateRange: undefined,
      startTime: "",
      endTime: ""
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
    setPickupsDrops(pickupsDrops.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        
        // If updating address field, parse it into components
        if (field === 'address' && typeof value === 'string' && value.trim()) {
          const parsed = parseAddress(value);
          updated.address = parsed.address || value;
          updated.city = parsed.city || undefined;
          updated.state = parsed.state || undefined;
          updated.zipCode = parsed.zipCode || undefined;
        }
        
        // Auto-update datetime when relevant fields change
        if (field === 'dateRange' || field === 'startTime') {
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
    }));
  };

  const updatePickupDropDateRange = (id: string, dateRange: DateRange | undefined) => {
    setPickupsDrops(pickupsDrops.map(item => {
      if (item.id === id) {
        const updated = { ...item, dateRange };
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
    }));
  };

  const updatePickupDropTime = (id: string, timeType: 'startTime' | 'endTime', time: string) => {
    setPickupsDrops(pickupsDrops.map(item => {
      if (item.id === id) {
        const updated = { ...item, [timeType]: time };
        // Auto-update datetime when startTime changes
        if (timeType === 'startTime' && updated.dateRange?.from && updated.startTime) {
          const combined = combineDateAndTime(updated.dateRange.from, updated.startTime);
          updated.datetime = combined || "";
        } else if (timeType === 'startTime') {
          updated.datetime = "";
        }
        return updated;
      }
      return item;
    }));
  };

  const togglePickupDropType = (id: string) => {
    setPickupsDrops(pickupsDrops.map(item => {
      if (item.id === id) {
        return { ...item, type: item.type === "pickup" ? "delivery" : "pickup" };
      }
      return item;
    }));
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(pickupsDrops);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setPickupsDrops(items);
  };

  // File drag and drop handlers
  const createFileDragHandlers = (fileType: 'rc' | 'bol' | 'pod' | 'additional') => {
    const setFiles = {
      rc: setRcFiles,
      bol: setBolFiles,
      pod: setPodFiles,
      additional: setAdditionalFiles
    }[fileType];

    const fileInputRef = {
      rc: rcFileInputRef,
      bol: bolFileInputRef,
      pod: podFileInputRef,
      additional: additionalFileInputRef
    }[fileType];

    return {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        setDragStates(prev => ({ ...prev, [fileType]: true }));
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        // Only set drag state to false if we're leaving the drop zone entirely
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
          setDragStates(prev => ({ ...prev, [fileType]: false }));
        }
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragStates(prev => ({ ...prev, [fileType]: false }));
        
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          setFiles(files);
        }
      },
      onClick: (e: React.MouseEvent) => {
        // Don't trigger if clicking on buttons or interactive elements
        const target = e.target as HTMLElement;
        if (target.closest('button, input, a')) {
          return;
        }
        fileInputRef.current?.click();
      }
    };
  };

  const rcDragHandlers = createFileDragHandlers('rc');
  const bolDragHandlers = createFileDragHandlers('bol');
  const podDragHandlers = createFileDragHandlers('pod');
  const additionalDragHandlers = createFileDragHandlers('additional');

  const handleExtractWithAI = async () => {
    if (!rcFiles || rcFiles.length === 0) {
      toast({
        title: "No RC File Selected",
        description: "Please select a PDF file in the RC section to extract data from.",
        variant: "destructive"
      });
      return;
    }

    const pdfFile = Array.from(rcFiles).find(file => file.type === 'application/pdf');
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
      console.log('Starting PDF extraction with OpenAI...');
      
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      
      console.log('Calling extract-order-fields edge function...');
      
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/extract-order-fields`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM'}`,
          },
          body: formData
        }
      );

      console.log('Edge function response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge function error:', errorText);
        throw new Error(`Edge function failed with status ${response.status}`);
      }
      
      const data = await response.json();

      if (!data?.success) {
        console.error('Extraction failed:', data?.error);
        throw new Error(data?.error || 'Failed to extract data');
      }

      const extractedData = data.data;
      console.log('Successfully extracted data:', extractedData);
      
      // Auto-fill broker if matched
      if (extractedData.matchedBrokerId) {
        console.log('✅ Auto-filling broker with matched ID:', extractedData.matchedBrokerId);
        setBroker(extractedData.matchedBrokerId);
        toast({
          title: "Broker Matched",
          description: `Automatically matched broker: ${extractedData.brokerName || 'from database'}`,
        });
      } else if (extractedData.brokerName) {
        console.log('⚠️ Broker extracted but not matched:', extractedData.brokerName);
        toast({
          title: "Broker Not Matched",
          description: `Extracted broker "${extractedData.brokerName}" but couldn't find a match in database. Please select manually.`,
          variant: "destructive",
        });
      }
      
      // Populate form fields with extracted data
      if (extractedData.brokerLoadNumber) {
        setBrokerLoadNumber(extractedData.brokerLoadNumber);
      }
      if (extractedData.freightAmount) {
        setFreightAmount(extractedData.freightAmount.toString());
        setDriverPrice(extractedData.freightAmount.toString()); // Auto-populate driver price with same amount
      }
      if (extractedData.mileage) {
        setLoadedMiles(extractedData.mileage.toString());
      }

      // Handle date ranges from AI extraction - fix timezone offset
      if (extractedData.pickupStartDate && extractedData.pickupEndDate) {
        setPickupDateRange({
          from: new Date(extractedData.pickupStartDate + 'T12:00:00'),
          to: new Date(extractedData.pickupEndDate + 'T12:00:00')
        });
      } else if (extractedData.pickupDate) {
        const pickupDate = new Date(extractedData.pickupDate + 'T12:00:00');
        setPickupDateRange({
          from: pickupDate,
          to: pickupDate
        });
      }

      if (extractedData.deliveryStartDate && extractedData.deliveryEndDate) {
        setDeliveryDateRange({
          from: new Date(extractedData.deliveryStartDate + 'T12:00:00'),
          to: new Date(extractedData.deliveryEndDate + 'T12:00:00')
        });
      } else if (extractedData.deliveryDate) {
        const deliveryDate = new Date(extractedData.deliveryDate + 'T12:00:00');
        setDeliveryDateRange({
          from: deliveryDate,
          to: deliveryDate
        });
      }
      
      // Auto-fill driver pickup/delivery times from extracted data
      if (extractedData.pickups && extractedData.pickups.length > 0 && extractedData.pickups[0]) {
        const firstPickup = extractedData.pickups[0];
        if (firstPickup.date) {
          setDriverPickupDateRange({
            from: new Date(firstPickup.date + 'T12:00:00'),
            to: new Date(firstPickup.date + 'T12:00:00')
          });
        }
        setDriverPickupStartTime(firstPickup.startTime || "");
        setDriverPickupEndTime(firstPickup.endTime || "");
      } else if (extractedData.pickupDate || (extractedData.pickupStartDate && extractedData.pickupEndDate)) {
        const pickupDate = extractedData.pickupStartDate 
          ? new Date(extractedData.pickupStartDate + 'T12:00:00')
          : new Date(extractedData.pickupDate + 'T12:00:00');
        const pickupEndDate = extractedData.pickupEndDate
          ? new Date(extractedData.pickupEndDate + 'T12:00:00')
          : pickupDate;
        setDriverPickupDateRange({ from: pickupDate, to: pickupEndDate });
        
        // Handle both single time and time range
        if (extractedData.pickupStartTime || extractedData.pickupEndTime) {
          setDriverPickupStartTime(extractedData.pickupStartTime || "");
          setDriverPickupEndTime(extractedData.pickupEndTime || "");
        } else if (extractedData.pickupTime) {
          // If only single time provided, use it for both start and end
          setDriverPickupStartTime(extractedData.pickupTime);
          setDriverPickupEndTime(extractedData.pickupTime);
        }
      }

      if (extractedData.deliveries && extractedData.deliveries.length > 0 && extractedData.deliveries[0] && extractedData.deliveries[0].date) {
        const firstDelivery = extractedData.deliveries[0];
        setDriverDeliveryDateRange({
          from: new Date(firstDelivery.date + 'T12:00:00'),
          to: new Date(firstDelivery.date + 'T12:00:00')
        });
        setDriverDeliveryStartTime(firstDelivery.startTime || "");
        setDriverDeliveryEndTime(firstDelivery.endTime || "");
      } else if (extractedData.deliveryDate || (extractedData.deliveryStartDate && extractedData.deliveryEndDate)) {
        const deliveryDate = extractedData.deliveryStartDate
          ? new Date(extractedData.deliveryStartDate + 'T12:00:00')
          : new Date(extractedData.deliveryDate + 'T12:00:00');
        const deliveryEndDate = extractedData.deliveryEndDate
          ? new Date(extractedData.deliveryEndDate + 'T12:00:00')
          : deliveryDate;
        setDriverDeliveryDateRange({ from: deliveryDate, to: deliveryEndDate });
        
        // Handle both single time and time range
        if (extractedData.deliveryStartTime || extractedData.deliveryEndTime) {
          setDriverDeliveryStartTime(extractedData.deliveryStartTime || "");
          setDriverDeliveryEndTime(extractedData.deliveryEndTime || "");
        } else if (extractedData.deliveryTime) {
          // If only single time provided, use it for both start and end
          setDriverDeliveryStartTime(extractedData.deliveryTime);
          setDriverDeliveryEndTime(extractedData.deliveryTime);
        }
      }

      // Handle pickups and deliveries with date ranges
      const newPickupsDrops: PickupDrop[] = [];
      
      // Helper function to safely create date range
      const createSafeDateRange = (dateStr: string | undefined): DateRange | undefined => {
        if (!dateStr) return undefined;
        try {
          const date = new Date(dateStr + 'T12:00:00');
          if (isNaN(date.getTime())) return undefined;
          return { from: date, to: date };
        } catch {
          return undefined;
        }
      };
      
      // Sort pickups and deliveries by datetime before processing
      if (extractedData.pickups && extractedData.pickups.length > 1) {
        extractedData.pickups.sort((a: any, b: any) => {
          const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
          const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
          return dateA.localeCompare(dateB);
        });
      }
      
      if (extractedData.deliveries && extractedData.deliveries.length > 1) {
        extractedData.deliveries.sort((a: any, b: any) => {
          const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
          const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
          return dateA.localeCompare(dateB);
        });
      }
      
      // Check if we have multi-drop data
      if (extractedData.pickups && extractedData.pickups.length > 0) {
        // Multi-drop pickups
        extractedData.pickups.forEach((pickup: any, index: number) => {
          const pickupDateRange = createSafeDateRange(pickup.date);

          newPickupsDrops.push({
            id: `pickup-${index + 1}`,
            type: "pickup",
            address: pickup.address || "",
            city: pickup.city || "",
            state: pickup.state || "",
            zipCode: pickup.zip || "",
            datetime: pickup.date || "",
            dateRange: pickupDateRange,
            startTime: pickup.startTime || "",
            endTime: pickup.endTime || "",
            companyName: pickup.shipper || ""
          });
        });
      } else if (extractedData.pickupAddress) {
        // Single pickup (legacy format)
        const pickupDateRange = extractedData.pickupStartDate && extractedData.pickupEndDate 
          ? (() => {
              try {
                const from = new Date(extractedData.pickupStartDate + 'T12:00:00');
                const to = new Date(extractedData.pickupEndDate + 'T12:00:00');
                if (isNaN(from.getTime()) || isNaN(to.getTime())) return undefined;
                return { from, to };
              } catch { return undefined; }
            })()
          : createSafeDateRange(extractedData.pickupDate);

        newPickupsDrops.push({
          id: "pickup-1",
          type: "pickup",
          address: extractedData.pickupAddress || "",
          city: extractedData.pickupCity || "",
          state: extractedData.pickupState || "",
          zipCode: extractedData.pickupZip || "",
          datetime: extractedData.pickupDate || "",
          dateRange: pickupDateRange,
          startTime: extractedData.pickupStartTime || extractedData.pickupTime || "",
          endTime: extractedData.pickupEndTime || extractedData.pickupTime || "",
          companyName: extractedData.pickupShipper || ""
        });
      }
      
      if (extractedData.deliveries && extractedData.deliveries.length > 0) {
        // Multi-drop deliveries
        extractedData.deliveries.forEach((delivery: any, index: number) => {
          const deliveryDateRange = createSafeDateRange(delivery.date);

          newPickupsDrops.push({
            id: `delivery-${index + 1}`,
            type: "delivery",
            address: delivery.address || "",
            city: delivery.city || "",
            state: delivery.state || "",
            zipCode: delivery.zip || "",
            datetime: delivery.date || "",
            dateRange: deliveryDateRange,
            startTime: delivery.startTime || "",
            endTime: delivery.endTime || "",
            companyName: delivery.receiver || delivery.shipper || ""
          });
        });
      } else if (extractedData.deliveryAddress) {
        // Single delivery (legacy format)
        const deliveryDateRange = extractedData.deliveryStartDate && extractedData.deliveryEndDate 
          ? (() => {
              try {
                const from = new Date(extractedData.deliveryStartDate + 'T12:00:00');
                const to = new Date(extractedData.deliveryEndDate + 'T12:00:00');
                if (isNaN(from.getTime()) || isNaN(to.getTime())) return undefined;
                return { from, to };
              } catch { return undefined; }
            })()
          : createSafeDateRange(extractedData.deliveryDate);

        newPickupsDrops.push({
          id: "delivery-1",
          type: "delivery", 
          address: extractedData.deliveryAddress || "",
          city: extractedData.deliveryCity || "",
          state: extractedData.deliveryState || "",
          zipCode: extractedData.deliveryZip || "",
          datetime: extractedData.deliveryDate || "",
          dateRange: deliveryDateRange,
          startTime: extractedData.deliveryStartTime || extractedData.deliveryTime || "",
          endTime: extractedData.deliveryEndTime || extractedData.deliveryTime || "",
          companyName: extractedData.deliveryShipper || ""
        });
      }
      
      if (newPickupsDrops.length > 0) {
        setPickupsDrops(newPickupsDrops);
      }

      // Save additional extracted data
      if (extractedData.commodity) setCommodity(extractedData.commodity);
      if (extractedData.weight) setWeight(extractedData.weight.toString());
      
      // Handle shipper/receiver names from both formats
      if (extractedData.pickups && extractedData.pickups.length > 0) {
        // Multi-drop format
        if (extractedData.pickups[0].shipper) setPickupShipper(extractedData.pickups[0].shipper);
        if (extractedData.pickups[0].puNumber) setPickupPuNumber(extractedData.pickups[0].puNumber);
        if (extractedData.pickups[0].poNumber) setPickupPoNumber(extractedData.pickups[0].poNumber);
      } else {
        // Legacy single-drop format
        if (extractedData.pickupPuNumber) setPickupPuNumber(extractedData.pickupPuNumber);
        if (extractedData.pickupPoNumber) setPickupPoNumber(extractedData.pickupPoNumber);
        if (extractedData.pickupShipper) setPickupShipper(extractedData.pickupShipper);
      }
      
      if (extractedData.deliveries && extractedData.deliveries.length > 0) {
        // Multi-drop format
        if (extractedData.deliveries[0].shipper) setDeliveryShipper(extractedData.deliveries[0].shipper);
        if (extractedData.deliveries[0].poNumber) setDeliveryPoNumber(extractedData.deliveries[0].poNumber);
      } else {
        // Legacy single-drop format
        if (extractedData.deliveryPoNumber) setDeliveryPoNumber(extractedData.deliveryPoNumber);
        if (extractedData.deliveryShipper) setDeliveryShipper(extractedData.deliveryShipper);
      }

      toast({
        title: "Data Extracted Successfully",
        description: `Extracted ${data.fieldsExtracted} fields from PDF${newPickupsDrops.length > 2 ? ' (Multi-drop load detected)' : ''}. Please review and adjust as needed.`
      });

    } catch (error: any) {
      console.error('Extraction error:', error);
      toast({
        title: "Extraction Failed",
        description: error.message || "Failed to extract data from PDF",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // Build email subject line
  const buildEmailSubject = (): string => {
    const selectedTruck = trucks?.find(t => t.id === truck);
    const selectedDriver = drivers?.find(d => d.id === driver1);
    const pickups = pickupsDrops.filter(p => p.type === "pickup");
    const deliveries = pickupsDrops.filter(p => p.type === "delivery");
    
    const truckNumber = selectedTruck?.truck_number || "TBD";
    const driverFirstName = selectedDriver?.name?.split(' ')[0] || "Driver";
    const pickupDate = pickups[0]?.dateRange?.from 
      ? `${String(pickups[0].dateRange.from.getMonth() + 1).padStart(2, '0')}/${String(pickups[0].dateRange.from.getDate()).padStart(2, '0')}/${pickups[0].dateRange.from.getFullYear()}`
      : "TBD";
    const brokerLoad = brokerLoadNumber || "TBD";
    const firstPickupState = pickups[0]?.state || "TBD";
    const lastDeliveryState = deliveries[deliveries.length - 1]?.state || "TBD";
    
    return `#${truckNumber} ${driverFirstName} // ${pickupDate} // Load#${brokerLoad} // ${firstPickupState} - ${lastDeliveryState}`;
  };

  // Send email to driver with uploaded RC file
  const handleSendEmailToDriver = async () => {
    // Check if RC file is uploaded
    if (!rcFiles || rcFiles.length === 0) {
      toast({
        title: "No RC File",
        description: "Please upload an RC file first before sending email.",
        variant: "destructive"
      });
      return;
    }
    
    if (emailSent) return;
    
    try {
      setIsSendingEmail(true);
      
      // Get driver email
      const selectedDriver = drivers?.find(d => d.id === driver1);
      if (!selectedDriver?.email) {
        throw new Error("Driver email not found. Please ensure the driver has an email address.");
      }
      
      // Get truck company for email configuration
      const selectedTruck = trucks?.find(t => t.id === truck);
      const companyName = selectedTruck?.company?.name;
      
      if (!companyName) {
        throw new Error("Truck company not found. Cannot determine sender email.");
      }
      
      const emailConfig = COMPANY_EMAIL_CONFIG[companyName];
      if (!emailConfig) {
        throw new Error(`Email configuration not found for company: ${companyName}. Please contact support.`);
      }
      
      // Build email subject
      const subject = buildEmailSubject();
      
      // Use the uploaded RC file
      const rcFile = rcFiles[0];
      
      // Convert file to base64 for attachment
      const reader = new FileReader();
      reader.readAsDataURL(rcFile);
      
      await new Promise((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64data = reader.result as string;
            const base64Content = base64data.split(',')[1]; // Remove data:application/pdf;base64, prefix
            
            console.log('📧 Sending email with RC file:', rcFile.name);
            console.log('📧 To:', selectedDriver.email);
            console.log('📧 From:', emailConfig.sender);
            console.log('📧 CC:', emailConfig.cc);
            console.log('📧 Subject:', subject);
            
            // Call edge function to send email
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(
              'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-load-confirmation-email',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM'}`,
                },
                body: JSON.stringify({
                  to: selectedDriver.email,
                  from: emailConfig.sender,
                  cc: emailConfig.cc,
                  subject: subject,
                  bodyText: "Please see the rate confirmation attached below.",
                  attachmentBase64: base64Content,
                  attachmentFilename: rcFile.name,
                  attachmentContentType: 'application/pdf'
                })
              }
            );
            
            const responseData = await response.json();
            console.log('📧 Email response:', responseData);
            
            if (!response.ok) {
              console.error('❌ Error sending email - Status:', response.status);
              console.error('❌ Error response:', responseData);
              throw new Error(responseData.error || 'Failed to send email');
            }
            
            setEmailSent(true);
            toast({
              title: "Email Sent",
              description: `Rate confirmation sent to ${selectedDriver.email}`
            });
            
            resolve(true);
          } catch (err) {
            console.error('❌ Email error:', err);
            reject(err);
          }
        };
        reader.onerror = reject;
      });
      
    } catch (error: any) {
      console.error('❌ Email sending error:', error);
      toast({
        title: "Email Failed",
        description: error.message || "Failed to send email to driver",
        variant: "destructive"
      });
    } finally {
      setIsSendingEmail(false);
    }
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
        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
      };

      const formatTime = (time?: string) => time || "";

      // Prepare base data for load confirmation
      const baseData = {
        brokerLoadNumber: brokerLoadNumber || "TBD",
        driverName: selectedDriver.name,
        truckNumber: selectedTruck.truck_number,
        trailerNumber: trailer ? trucks?.find(t => t.id === truck)?.trailer?.trailer_number || "" : "",
        phoneNumber: selectedDriver.phone || "",
        commodity: commodity || "",
        weight: weight || "",
        miles: loadedMiles || "",
        rate: driverPrice || "",
      };

      // Helper to format location data
      const formatLocationData = (location: any) => ({
        address: location.address,
        cityStateZip: `${location.city || ''}${location.city && location.state ? ', ' : ''}${location.state || ''}${(location.city || location.state) && location.zipCode ? ' ' : ''}${location.zipCode || ''}`.trim(),
        date: formatDate(location.dateRange),
        time: formatTime(location.startTime) + (location.endTime ? ` - ${formatTime(location.endTime)}` : "")
      });

      // Build confirmation data with all pickups and deliveries
      const confirmationData: any = {
        ...baseData,
        // First pickup (always present)
        pickupShipper: pickupShipper || "",
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
      confirmationData.deliveryReceiver = deliveryShipper || "";
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
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/generate-load-confirmation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM'}`,
          },
          body: JSON.stringify(confirmationData)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate confirmation');
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
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Confirmation Generated",
        description: "Load confirmation PDF has been generated. You can now email it to the driver."
      });

    } catch (error: any) {
      console.error('Confirmation generation error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate load confirmation",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingConfirmation(false);
    }
  };

  // Prepare options for dropdowns
  const companyOptions = filteredCompanies?.map(company => ({
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

  // Import timezone-agnostic date utilities
  
  // Check for duplicate orders with same broker load# and pickup date
  const checkForDuplicates = async () => {
    if (!brokerLoadNumber?.trim()) return [];
    
    const pickups = pickupsDrops.filter(item => item.type === 'pickup');
    if (pickups.length === 0 || !pickups[0].dateRange?.from) return [];
    
    const pickupDate = pickups[0].dateRange.from;
    const pickupDateStr = pickupDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Query for orders with same broker load number
    const { data: existingOrders, error } = await supabase
      .from('orders')
      .select('id, internal_load_number, broker_load_number, pickup_datetime, status')
      .eq('broker_load_number', brokerLoadNumber.trim())
      .not('status', 'eq', 'canceled');
    
    if (error) {
      console.error('Error checking for duplicate orders:', error);
      return [];
    }
    
    if (!existingOrders || existingOrders.length === 0) return [];
    
    // Filter orders with the same pickup date
    const duplicates = existingOrders.filter(order => {
      if (!order.pickup_datetime) return false;
      const orderPickupDate = new Date(order.pickup_datetime).toISOString().split('T')[0];
      return orderPickupDate === pickupDateStr;
    });
    
    return duplicates;
  };

  const handleSubmit = async (e: React.FormEvent, skipDuplicateCheck = false) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('Form submission already in progress, ignoring duplicate submission');
      return;
    }

    // Validation checks
    if (!bookedByCompany) {
      toast({
        title: "Booked by Company Required",
        description: "Please select a booked by company.",
        variant: "destructive"
      });
      return;
    }

    if (!brokerLoadNumber?.trim()) {
      toast({
        title: "Broker Load# Required",
        description: "Please enter a broker load number.",
        variant: "destructive"
      });
      return;
    }

    if (!broker) {
      toast({
        title: "Broker Required",
        description: "Please select a broker.",
        variant: "destructive"
      });
      return;
    }

    if (!truck) {
      toast({
        title: "Truck# Required",
        description: "Please select a truck.",
        variant: "destructive"
      });
      return;
    }

    // Validate pickup addresses and date/time ranges
    const pickups = pickupsDrops.filter(item => item.type === 'pickup');
    if (pickups.length === 0) {
      toast({
        title: "Pickup Required",
        description: "Please add at least one pickup location.",
        variant: "destructive"
      });
      return;
    }

    for (const pickup of pickups) {
      if (!pickup.address?.trim()) {
        toast({
          title: "Pickup Address Required",
          description: "Please enter an address for all pickup locations.",
          variant: "destructive"
        });
        return;
      }
      if (!pickup.dateRange?.from) {
        toast({
          title: "Pickup Date Required",
          description: "Please select a date range for all pickup locations.",
          variant: "destructive"
        });
        return;
      }
      if (!pickup.startTime?.trim() || !pickup.endTime?.trim()) {
        toast({
          title: "Pickup Time Required",
          description: "Please enter start and end times for all pickup locations.",
          variant: "destructive"
        });
        return;
      }
    }

    // Validate delivery addresses and date/time ranges
    const deliveries = pickupsDrops.filter(item => item.type === 'delivery');
    if (deliveries.length === 0) {
      toast({
        title: "Delivery Required",
        description: "Please add at least one delivery location.",
        variant: "destructive"
      });
      return;
    }

    for (const delivery of deliveries) {
      if (!delivery.address?.trim()) {
        toast({
          title: "Delivery Address Required",
          description: "Please enter an address for all delivery locations.",
          variant: "destructive"
        });
        return;
      }
      if (!delivery.dateRange?.from) {
        toast({
          title: "Delivery Date Required",
          description: "Please select a date range for all delivery locations.",
          variant: "destructive"
        });
        return;
      }
      if (!delivery.startTime?.trim() || !delivery.endTime?.trim()) {
        toast({
          title: "Delivery Time Required",
          description: "Please enter start and end times for all delivery locations.",
          variant: "destructive"
        });
        return;
      }
    }

    if (!freightAmount?.trim() || parseFloat(freightAmount) <= 0) {
      toast({
        title: "Freight Amount Required",
        description: "Please enter a valid freight amount.",
        variant: "destructive"
      });
      return;
    }

    if (!loadedMiles?.trim() || parseInt(loadedMiles) <= 0) {
      toast({
        title: "Total Miles Required",
        description: "Please enter valid total miles (loaded miles).",
        variant: "destructive"
      });
      return;
    }

    if (!truck) {
      toast({
        title: "Truck Required",
        description: "Please select a truck. The internal load number is based on the truck's company.",
        variant: "destructive"
      });
      return;
    }
    
    // Check for duplicates unless explicitly skipped
    if (!skipDuplicateCheck) {
      const duplicates = await checkForDuplicates();
      if (duplicates.length > 0) {
        setDuplicateOrders(duplicates);
        setShowDuplicateWarning(true);
        return;
      }
    }
    
    setIsSubmitting(true);
    try {
      // Default to BF Prime LLC if booked by company is not selected
      const bfPrimeCompany = companies?.find(c => c.name === 'BF Prime');
      const finalBookedByCompany = bookedByCompany || (bfPrimeCompany?.id || null);
      
      // Create order data object for the atomic function
      const orderData = {
        load_number: brokerLoadNumber || `AUTO-${Date.now()}`,
        company_id: truckCompanyId, // Truck's company for internal load numbering
        booked_by_company_id: finalBookedByCompany, // Company that booked the order (defaults to BF Prime LLC)
        broker_id: broker || null,
        truck_id: truck || null,
        trailer_id: truck && trucks ? trucks.find(t => t.id === truck)?.trailer_id || null : null,
        driver1_id: driver1 || null,
        driver2_id: driver2 || null,
        broker_load_number: brokerLoadNumber || null,
         pickup_datetime: (() => {
           const allPickups = pickupsDrops.filter(item => item.type === 'pickup');
           const firstPickup = allPickups[0];
            if (firstPickup?.dateRange?.from && firstPickup?.startTime) {
              return combineDateAndTime(firstPickup.dateRange.from, firstPickup.startTime);
            }
            return null;
          })(),
         pickup_end_datetime: (() => {
           const allPickups = pickupsDrops.filter(item => item.type === 'pickup');
           const lastPickup = allPickups[allPickups.length - 1];
            if (lastPickup?.dateRange?.from && lastPickup?.endTime) {
              return combineDateAndTime(lastPickup.dateRange.from, lastPickup.endTime);
            }
            return null;
          })(),
         delivery_datetime: (() => {
           const allDeliveries = pickupsDrops.filter(item => item.type === 'delivery');
           const firstDelivery = allDeliveries[0];
            if (firstDelivery?.dateRange?.from && firstDelivery?.startTime) {
              return combineDateAndTime(firstDelivery.dateRange.from, firstDelivery.startTime);
            }
            return null;
          })(),
         delivery_end_datetime: (() => {
           const allDeliveries = pickupsDrops.filter(item => item.type === 'delivery');
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
        mileage: ((parseInt(dhMiles) || 0) + (parseInt(loadedMiles) || 0)) || null,
        commodity: commodity || null,
        weight: weight ? parseFloat(weight) : null,
        reference_number: pickupPuNumber || null,
        po_number: pickupPoNumber || deliveryPoNumber || null,
        pu_number: pickupPuNumber || null,
        booked_by: profile?.full_name || 'Unknown User'
      };

      // Use the atomic function to create order with unique internal load number
      const { data: result, error: rpcError } = await supabase.rpc('create_order_with_unique_load_number', {
        order_data: orderData
      }) as { data: { id: string; internal_load_number: number }, error: any };

      if (rpcError) throw rpcError;

      const orderId = result.id;
      const newInternalLoadNumber = result.internal_load_number;

      // Upload files if any
      const allFiles = [
        { files: rcFiles, category: 'RC' },
        { files: bolFiles, category: 'BOL' },
        { files: podFiles, category: 'POD' },
        { files: additionalFiles, category: 'ADDITIONAL' }
      ];

      for (const { files, category } of allFiles) {
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = `${orderId}/${category}/${Date.now()}_${file.name}`;
            
            const { error: uploadError } = await supabase.storage
              .from('order-files')
              .upload(fileName, file);
              
            if (uploadError) throw uploadError;
            
            const { error: fileError } = await supabase
              .from('order_files')
              .insert({
                order_id: orderId,
                file_name: file.name,
                file_path: fileName,
                file_size: file.size,
                content_type: file.type,
                file_category: category,
                uploaded_by: profile?.full_name || profile?.email || 'Unknown User'
              });
              
            if (fileError) throw fileError;
          }
        }
      }

      // Insert pickup/drop locations
      if (pickupsDrops.length > 0) {
        const pickupDropData = pickupsDrops.filter(item => item.address).map(item => {
          // Use the robust address parser
          const parsed = parseAddress(item.address);
          
          // Prefer explicit city/state/zip from item if provided, otherwise use parsed
          const city = item.city || parsed.city;
          const state = item.state || parsed.state;
          const zipCode = item.zipCode || parsed.zipCode;
          const cleanAddress = parsed.address;
          
            return {
            order_id: orderId,
            type: item.type,
            address: cleanAddress,
            city,
            state,
            zip_code: zipCode,
            company_name: item.companyName || '',
            datetime: item.dateRange?.from && item.startTime 
              ? combineDateAndTime(item.dateRange.from, item.startTime)
              : null,
            end_datetime: item.dateRange?.from && item.endTime 
              ? combineDateAndTime(item.dateRange.from, item.endTime)
              : null
          };
        });
        
        // Deduplicate only exact matches (all fields must match)
        const uniquePickupDropData = pickupDropData.filter((item, index, self) => {
          return index === self.findIndex((t) => (
            t.type === item.type &&
            t.address === item.address &&
            t.city === item.city &&
            t.state === item.state &&
            t.zip_code === item.zip_code &&
            t.company_name === item.company_name &&
            t.datetime === item.datetime &&
            t.end_datetime === item.end_datetime
          ));
        });
        
        if (uniquePickupDropData.length > 0) {
          const { error: pickupDropError } = await supabase.from('pickup_drops').insert(uniquePickupDropData);
          if (pickupDropError) throw pickupDropError;
        }
      }

      toast({
        title: "Load Created",
        description: `Load ${newInternalLoadNumber} has been successfully created.`
      });

      // Invalidate query cache to refetch next internal load number
      queryClient.invalidateQueries({ queryKey: ['nextInternalLoadNumber'] });

      // Reset form and refetch next internal load number
      setBrokerLoadNumber('');
      setBroker('');
      
      // Redirect to orders page
      navigate('/orders');
      setTruck('');
      setDriver1('');
      setDriver2('');
      setTrailer('');
      setPickupDateRange(undefined);
      setDeliveryDateRange(undefined);
      setFreightAmount('');
      setDriverPrice('');
      setTonu('');
      setDhMiles('');
      setLoadedMiles('');
      setRcFiles(null);
      setBolFiles(null);
      setPodFiles(null);
      setAdditionalFiles(null);
      const rcInput = document.getElementById('rc-files') as HTMLInputElement;
      const bolInput = document.getElementById('bol-files') as HTMLInputElement;
      const podInput = document.getElementById('pod-files') as HTMLInputElement;
      const additionalInput = document.getElementById('additional-files') as HTMLInputElement;
      if (rcInput) rcInput.value = '';
      if (bolInput) bolInput.value = '';
      if (podInput) podInput.value = '';
      if (additionalInput) additionalInput.value = '';
      setPickupsDrops([{
        id: "pickup-1",
        type: "pickup",
        address: "",
        datetime: "",
        dateRange: undefined,
        startTime: "",
        endTime: ""
      }, {
        id: "delivery-1",
        type: "delivery",
        address: "",
        datetime: "",
        dateRange: undefined,
        startTime: "",
        endTime: ""
      }]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
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
              <div className="text-lg font-medium">{nextInternalLoadNumber || 'Loading...'}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* RC Upload Section - Top Priority */}
            <Card 
              className={cn(
                "bg-blue-50/50 border-blue-200 transition-all duration-200 cursor-pointer",
                dragStates.rc && "border-blue-400 bg-blue-100/50 scale-[1.02]"
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
                        : "Click or drag files here to upload"
                      }
                    </Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExtractWithAI();
                      }}
                      disabled={isExtracting || !rcFiles || rcFiles.length === 0 || !Array.from(rcFiles || []).some(f => f.type === 'application/pdf')}
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
                  
                  {!dragStates.rc && rcFiles && rcFiles.length > 0 && (
                    <div className="space-y-2">
                      {Array.from(rcFiles).map((file, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-white rounded border border-blue-200">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span className="text-sm text-gray-700 truncate">{file.name}</span>
                          <span className="text-xs text-gray-500">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {!dragStates.rc && (!rcFiles || rcFiles.length === 0) && (
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
                    onChange={e => setRcFiles(e.target.files)} 
                    className="hidden"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="broker-load-number">Broker Load #</Label>
              <Input 
                id="broker-load-number" 
                placeholder="Broker load number" 
                value={brokerLoadNumber} 
                onChange={e => setBrokerLoadNumber(e.target.value)} 
              />
            </div>
            
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
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => refetchCompanies()}
                      className="ml-2"
                    >
                      Retry Now
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company">Booked by Company</Label>
                <Combobox 
                  options={companyOptions} 
                  value={bookedByCompany} 
                  onValueChange={setBookedByCompany} 
                  placeholder={companiesLoading ? "Loading companies..." : companiesError ? "Error loading companies" : "Select company"} 
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="truck">Truck #</Label>
                <Combobox 
                  options={truckOptions} 
                  value={truck} 
                  onValueChange={setTruck} 
                  placeholder={trucksLoading ? "Loading trucks..." : trucksError ? "Error loading trucks" : "Select truck"} 
                  searchPlaceholder="Search trucks..." 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailer">Trailer # (Auto-filled)</Label>
                <Input 
                  id="trailer" 
                  placeholder="Trailer number" 
                  value={trailer} 
                  onChange={e => {
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
                  options={[{ value: "", label: "None" }, ...driverOptions]} 
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
                                        : "bg-green-100 text-green-700 hover:bg-green-200"
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
                                    placeholder={item.type === "pickup" ? "Shipper company name" : "Receiver company name"}
                                    value={item.companyName || ""}
                                    onChange={(e) => {
                                      const updated = pickupsDrops.map(p => 
                                        p.id === item.id ? { ...p, companyName: e.target.value } : p
                                      );
                                      setPickupsDrops(updated);
                                    }}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label htmlFor={`address-${item.id}`}>Address</Label>
                                  <Textarea
                                    id={`address-${item.id}`}
                                    placeholder="Full address (e.g., 123 Main St, Springfield, IL 62701)"
                                    value={
                                      item.city || item.state || item.zipCode
                                        ? `${item.address}${item.city ? `, ${item.city}` : ''}${item.state ? `, ${item.state}` : ''}${item.zipCode ? ` ${item.zipCode}` : ''}`
                                        : item.address
                                    }
                                    onChange={(e) => updatePickupDrop(item.id, 'address', e.target.value)}
                                    className="min-h-[60px]"
                                  />
                                  {(item.city || item.state || item.zipCode) && (
                                    <p className="text-xs text-muted-foreground">
                                      Parsed: {item.address} | {item.city || '—'}, {item.state || '—'} {item.zipCode || '—'}
                                    </p>
                                  )}
                                </div>
                                
                                <div className="space-y-1">
                                  <Label htmlFor={`daterange-${item.id}`}>Date & Time Range</Label>
                                  <DateTimeRangePicker
                                    date={item.dateRange}
                                    onDateChange={(dateRange) => updatePickupDropDateRange(item.id, dateRange)}
                                    startTime={item.startTime || ""}
                                    endTime={item.endTime || ""}
                                    onStartTimeChange={(time) => updatePickupDropTime(item.id, 'startTime', time)}
                                    onEndTimeChange={(time) => updatePickupDropTime(item.id, 'endTime', time)}
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
                  {isCalculatingDhMiles && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (Calculating...)
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input 
                    id="dh-miles" 
                    type="number" 
                    placeholder={lastDelivery ? "Auto-calculated from last delivery" : "0"} 
                    value={dhMiles} 
                    onChange={e => setDhMiles(e.target.value)}
                    disabled={isCalculatingDhMiles}
                    className={cn(
                      isCalculatingDhMiles && "bg-muted cursor-not-allowed"
                    )}
                  />
                  {isCalculatingDhMiles && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {lastDelivery && dhMiles && !isCalculatingDhMiles 
                    ? `From: ${lastDelivery.deliveryAddress}` 
                    : '\u00A0'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loaded-miles">
                  Loaded Miles
                  {isCalculatingMiles && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (Calculating...)
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input 
                    id="loaded-miles" 
                    type="number" 
                    placeholder="0" 
                    value={loadedMiles} 
                    onChange={e => setLoadedMiles(e.target.value)} 
                    disabled={isCalculatingMiles}
                    className={cn(
                      isCalculatingMiles && "bg-muted cursor-not-allowed"
                    )}
                  />
                  {isCalculatingMiles && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Auto-calculated from pickup to delivery addresses
                </p>
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
                  onChange={e => setFreightAmount(e.target.value)} 
                />
                <p className="text-xs text-muted-foreground">
                  RPM: ${((parseFloat(freightAmount) || 0) / ((parseFloat(dhMiles) || 0) + (parseFloat(loadedMiles) || 0)) || 0).toFixed(2)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-price">Price for Driver</Label>
                <Input 
                  id="driver-price" 
                  type="number" 
                  placeholder="0.00" 
                  value={driverPrice} 
                  onChange={e => setDriverPrice(e.target.value)} 
                />
                <p className="text-xs text-muted-foreground">
                  RPM: ${((parseFloat(driverPrice) || 0) / ((parseFloat(dhMiles) || 0) + (parseFloat(loadedMiles) || 0)) || 0).toFixed(2)}
                </p>
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
                  onChange={e => {
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
                  dragStates.bol && "border-green-400 bg-green-50/50 scale-[1.02]"
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
                        {bolFiles && bolFiles.length > 0 
                          ? `${bolFiles.length} file(s) selected` 
                          : "Click or drag files here"
                        }
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
                    onChange={e => setBolFiles(e.target.files)} 
                    className="hidden"
                  />
                  <p className="text-xs text-green-600">Bill of lading documents</p>
                </CardContent>
              </Card>

              <Card 
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  dragStates.pod && "border-purple-400 bg-purple-50/50 scale-[1.02]"
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
                        {podFiles && podFiles.length > 0 
                          ? `${podFiles.length} file(s) selected` 
                          : "Click or drag files here"
                        }
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
                    onChange={e => setPodFiles(e.target.files)} 
                    className="hidden"
                  />
                  <p className="text-xs text-purple-600">Delivery confirmation documents</p>
                </CardContent>
              </Card>

              <Card 
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  dragStates.additional && "border-orange-400 bg-orange-50/50 scale-[1.02]"
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
                        {additionalFiles && additionalFiles.length > 0 
                          ? `${additionalFiles.length} file(s) selected` 
                          : "Click or drag files here"
                        }
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
                    onChange={e => setAdditionalFiles(e.target.files)} 
                    className="hidden"
                  />
                  <p className="text-xs text-orange-600">Other supporting documents</p>
                </CardContent>
              </Card>
            </div>

            {/* Driver-specific Pickup/Delivery Times for Load Confirmation */}
            <Card className="bg-blue-50/30 border-blue-200">
              <CardHeader>
                <CardTitle className="text-base">Driver Load Confirmation Times</CardTitle>
                <p className="text-sm text-muted-foreground">
                  These times are used only for generating the driver's load confirmation PDF (not saved to database)
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Driver Pickup Date & Time</Label>
                    <DateTimeRangePicker
                      date={driverPickupDateRange}
                      onDateChange={setDriverPickupDateRange}
                      startTime={driverPickupStartTime}
                      endTime={driverPickupEndTime}
                      onStartTimeChange={setDriverPickupStartTime}
                      onEndTimeChange={setDriverPickupEndTime}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Driver Delivery Date & Time</Label>
                    <DateTimeRangePicker
                      date={driverDeliveryDateRange}
                      onDateChange={setDriverDeliveryDateRange}
                      startTime={driverDeliveryStartTime}
                      endTime={driverDeliveryEndTime}
                      onStartTimeChange={setDriverDeliveryStartTime}
                      onEndTimeChange={setDriverDeliveryEndTime}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

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

            {/* Email Dispatch Toggle */}
            <div className="flex justify-center mt-4">
              <div className="flex items-center space-x-3 p-4 border rounded-lg bg-muted/50 w-full max-w-md">
                <div className="flex-1">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email to Driver
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {!confirmationGenerated 
                      ? "Generate confirmation first"
                      : emailSent
                      ? `Sent to ${drivers?.find(d => d.id === driver1)?.email || 'driver'}`
                      : "Toggle to send confirmation email"
                    }
                  </p>
                </div>
                <Switch
                  checked={emailSent}
                  onCheckedChange={(checked) => {
                    if (checked && !emailSent) {
                      handleSendEmailToDriver();
                    }
                  }}
                  disabled={!confirmationGenerated || isSendingEmail || emailSent}
                  className="data-[state=checked]:bg-green-600"
                />
                {isSendingEmail && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate('/orders')}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Load
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
              A load with the same Broker Load# <strong>({brokerLoadNumber})</strong> and pickup date already exists in the system:
              <div className="mt-3 space-y-2">
                {duplicateOrders.map((order) => (
                  <div key={order.id} className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <div className="font-medium">Internal Load #{order.internal_load_number}</div>
                    <div className="text-sm">Status: {order.status}</div>
                    <div className="text-sm">Pickup: {order.pickup_datetime ? new Date(order.pickup_datetime).toLocaleDateString() : 'N/A'}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                Are you sure you want to create this load anyway?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDuplicateWarning(false);
              setDuplicateOrders([]);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={(e) => {
              setShowDuplicateWarning(false);
              handleSubmit(e as any, true);
            }}>
              Create Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NewOrder;