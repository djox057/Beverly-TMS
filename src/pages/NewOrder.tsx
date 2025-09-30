import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { DateTimeRangePicker } from "@/components/ui/datetime-range-picker";
import { Plus, Trash2, Loader2, GripVertical, Sparkles, Upload, FileText } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/hooks/useCompanies";
import { useBrokers } from "@/hooks/useBrokers";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useNextInternalLoadNumber } from "@/hooks/useNextInternalLoadNumber";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuthContext } from "@/contexts/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { calculateLoadedMiles, calculateDhMiles, calculateMultiStopMiles } from "@/utils/routeCalculation";
import { useTruckLastDelivery } from "@/hooks/useTruckLastDelivery";

interface PickupDrop {
  id: string;
  type: "pickup" | "delivery";
  address: string;
  datetime: string;
  dateRange?: DateRange;
  startTime?: string;
  endTime?: string;
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
  const [pickupsDrops, setPickupsDrops] = useState<PickupDrop[]>([]);
  const [rcFiles, setRcFiles] = useState<FileList | null>(null);
  const [bolFiles, setBolFiles] = useState<FileList | null>(null);
  const [podFiles, setPodFiles] = useState<FileList | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<FileList | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCalculatingMiles, setIsCalculatingMiles] = useState(false);
  const [isCalculatingDhMiles, setIsCalculatingDhMiles] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuthContext();

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

  // Fetch data from database
  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: brokers, isLoading: brokersLoading } = useBrokers();
  const { data: trucks, isLoading: trucksLoading } = useTrucks();
  const { data: drivers, isLoading: driversLoading } = useDrivers();
  const { data: nextInternalLoadNumber, isLoading: loadingNextNumber } = useNextInternalLoadNumber(bookedByCompany);
  
  // Get the first pickup datetime for DH miles calculation
  const firstPickupDatetime = pickupsDrops.find(item => item.type === 'pickup')?.datetime || null;
  const { data: lastDelivery } = useTruckLastDelivery(truck || null, firstPickupDatetime);

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

  // Auto-populate trailer and drivers when truck is selected
  useEffect(() => {
    if (truck && trucks) {
      const selectedTruck = trucks.find(t => t.id === truck);
      if (selectedTruck) {
        setTrailer(selectedTruck.trailer?.trailer_number || '');
        setDriver1(selectedTruck.driver1?.id || '');
        setDriver2(selectedTruck.driver2?.id || '');
      }
    }
  }, [truck, trucks]);

  // Auto-calculate loaded miles when pickup and delivery addresses change
  useEffect(() => {
    const calculateMiles = async () => {
      if (pickupsDrops.length < 2) return;

      // Get all addresses in order (all pickups first, then all deliveries)
      const addresses = pickupsDrops
        .filter(item => item.address.trim())
        .map(item => item.address);

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

      console.log('🚚 =================================');
      console.log('🚚 DH MILES AUTO-CALCULATION');
      console.log('🚚 =================================');
      console.log('🚚 Truck ID:', truck);
      console.log('🚚 Last Delivery Address:', lastDelivery.deliveryAddress);
      console.log('🚚 Current Pickup Address:', firstPickup.address);
      console.log('🚚 Last Order ID:', lastDelivery.orderId);
      console.log('🚚 =================================');

      setIsCalculatingDhMiles(true);
      try {
        const miles = await calculateDhMiles(lastDelivery.deliveryAddress, firstPickup.address);
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
    setPickupsDrops(pickupsDrops.map(item => item.id === id ? {
      ...item,
      [field]: value
    } : item));
  };

  const updatePickupDropDateRange = (id: string, dateRange: DateRange | undefined) => {
    setPickupsDrops(pickupsDrops.map(item => item.id === id ? {
      ...item,
      dateRange
    } : item));
  };

  const updatePickupDropTime = (id: string, timeType: 'startTime' | 'endTime', time: string) => {
    setPickupsDrops(pickupsDrops.map(item => item.id === id ? {
      ...item,
      [timeType]: time
    } : item));
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
        e.stopPropagation();
        setDragStates(prev => ({ ...prev, [fileType]: true }));
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
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
        e.stopPropagation();
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragStates(prev => ({ ...prev, [fileType]: false }));
        
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          setFiles(files);
        }
      },
      onClick: (e: React.MouseEvent) => {
        // Don't trigger if clicking on the Extract with AI button
        if (fileType === 'rc' && (e.target as HTMLElement).closest('button[data-ai-extract]')) {
          return;
        }
        e.preventDefault();
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
      
      const response = await supabase.functions.invoke('extract-order-fields', {
        body: formData,
      });

      console.log('Edge function response:', response);

      if (response.error) {
        console.error('Edge function error:', response.error);
        throw new Error(response.error.message || 'Edge function failed');
      }

      if (!response.data?.success) {
        console.error('Extraction failed:', response.data?.error);
        throw new Error(response.data?.error || 'Failed to extract data');
      }

      const extractedData = response.data.data;
      console.log('Successfully extracted data:', extractedData);
      
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
      
      // Handle pickups and deliveries with date ranges
      const newPickupsDrops: PickupDrop[] = [];
      
      // Check if we have multi-drop data
      if (extractedData.pickups && extractedData.pickups.length > 0) {
        // Multi-drop pickups
        extractedData.pickups.forEach((pickup: any, index: number) => {
          const pickupDateRange = pickup.date 
            ? { from: new Date(pickup.date + 'T12:00:00'), to: new Date(pickup.date + 'T12:00:00') }
            : undefined;

          newPickupsDrops.push({
            id: `pickup-${index + 1}`,
            type: "pickup",
            address: pickup.zip 
              ? `${pickup.address}, ${pickup.city}, ${pickup.state} ${pickup.zip}`
              : `${pickup.address}${pickup.city ? `, ${pickup.city}` : ''}${pickup.state ? `, ${pickup.state}` : ''}`,
            datetime: pickup.date || "",
            dateRange: pickupDateRange,
            startTime: pickup.startTime || "",
            endTime: pickup.endTime || ""
          });
        });
      } else if (extractedData.pickupAddress) {
        // Single pickup (legacy format)
        const pickupDateRange = extractedData.pickupStartDate && extractedData.pickupEndDate 
          ? { from: new Date(extractedData.pickupStartDate + 'T12:00:00'), to: new Date(extractedData.pickupEndDate + 'T12:00:00') }
          : extractedData.pickupDate 
          ? { from: new Date(extractedData.pickupDate + 'T12:00:00'), to: new Date(extractedData.pickupDate + 'T12:00:00') }
          : undefined;

        newPickupsDrops.push({
          id: "pickup-1",
          type: "pickup",
          address: extractedData.pickupZip 
            ? `${extractedData.pickupAddress}, ${extractedData.pickupCity}, ${extractedData.pickupState} ${extractedData.pickupZip}`
            : `${extractedData.pickupAddress}${extractedData.pickupCity ? `, ${extractedData.pickupCity}` : ''}${extractedData.pickupState ? `, ${extractedData.pickupState}` : ''}`,
          datetime: extractedData.pickupDate || "",
          dateRange: pickupDateRange,
          startTime: extractedData.pickupStartTime || extractedData.pickupTime || "",
          endTime: extractedData.pickupEndTime || extractedData.pickupTime || ""
        });
      }
      
      if (extractedData.deliveries && extractedData.deliveries.length > 0) {
        // Multi-drop deliveries
        extractedData.deliveries.forEach((delivery: any, index: number) => {
          const deliveryDateRange = delivery.date 
            ? { from: new Date(delivery.date + 'T12:00:00'), to: new Date(delivery.date + 'T12:00:00') }
            : undefined;

          newPickupsDrops.push({
            id: `delivery-${index + 1}`,
            type: "delivery", 
            address: delivery.zip 
              ? `${delivery.address}, ${delivery.city}, ${delivery.state} ${delivery.zip}`
              : `${delivery.address}${delivery.city ? `, ${delivery.city}` : ''}${delivery.state ? `, ${delivery.state}` : ''}`,
            datetime: delivery.date || "",
            dateRange: deliveryDateRange,
            startTime: delivery.startTime || "",
            endTime: delivery.endTime || ""
          });
        });
      } else if (extractedData.deliveryAddress) {
        // Single delivery (legacy format)
        const deliveryDateRange = extractedData.deliveryStartDate && extractedData.deliveryEndDate 
          ? { from: new Date(extractedData.deliveryStartDate + 'T12:00:00'), to: new Date(extractedData.deliveryEndDate + 'T12:00:00') }
          : extractedData.deliveryDate 
          ? { from: new Date(extractedData.deliveryDate + 'T12:00:00'), to: new Date(extractedData.deliveryDate + 'T12:00:00') }
          : undefined;

        newPickupsDrops.push({
          id: "delivery-1",
          type: "delivery", 
          address: extractedData.deliveryZip 
            ? `${extractedData.deliveryAddress}, ${extractedData.deliveryCity}, ${extractedData.deliveryState} ${extractedData.deliveryZip}`
            : `${extractedData.deliveryAddress}${extractedData.deliveryCity ? `, ${extractedData.deliveryCity}` : ''}${extractedData.deliveryState ? `, ${extractedData.deliveryState}` : ''}`,
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
        description: `Extracted ${response.data.fieldsExtracted} fields from PDF${newPickupsDrops.length > 2 ? ' (Multi-drop load detected)' : ''}. Please review and adjust as needed.`
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

  // Prepare options for dropdowns
  const companyOptions = companies?.map(company => ({
    value: company.id,
    label: company.name
  })) || [];
  const brokerOptions = brokers?.map(broker => ({
    value: broker.id,
    label: broker.name
  })) || [];
  const truckOptions = trucks?.map(truck => ({
    value: truck.id,
    label: truck.truck_number
  })) || [];
  const driverOptions = drivers?.map(driver => ({
    value: driver.id,
    label: driver.name
  })) || [];

  // Helper function to combine date and time into ISO string
  const combineDateAndTime = (date: Date, time: string): string => {
    if (!time) return date.toISOString();
    
    const [hours, minutes] = time.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Create order data object for the atomic function
      const orderData = {
        load_number: brokerLoadNumber || `AUTO-${Date.now()}`,
        company_id: bookedByCompany,
        broker_id: broker || null,
        truck_id: truck || null,
        trailer_id: truck && trucks ? trucks.find(t => t.id === truck)?.trailer_id || null : null,
        driver1_id: driver1 || null,
        driver2_id: driver2 || null,
        broker_load_number: brokerLoadNumber || null,
        pickup_datetime: (() => {
          const firstPickup = pickupsDrops.find(item => item.type === 'pickup');
           if (firstPickup?.dateRange?.from && firstPickup?.startTime) {
             const result = combineDateAndTime(firstPickup.dateRange.from, firstPickup.startTime);
             console.log('Pickup datetime:', { startTime: firstPickup.startTime, dateFrom: firstPickup.dateRange.from, result });
             return result;
          }
          return pickupDateRange?.from?.toISOString() || null;
        })(),
        pickup_end_datetime: (() => {
          const firstPickup = pickupsDrops.find(item => item.type === 'pickup');
           if (firstPickup?.dateRange?.to && firstPickup?.endTime) {
             const result = combineDateAndTime(firstPickup.dateRange.to, firstPickup.endTime);
             console.log('Pickup end datetime:', { 
               endTime: firstPickup.endTime, 
               dateTo: firstPickup.dateRange.to, 
               dateFrom: firstPickup.dateRange.from,
               areSameDate: firstPickup.dateRange.from?.getTime() === firstPickup.dateRange.to?.getTime(),
               result 
             });
             return result;
          }
          return pickupDateRange?.to?.toISOString() || pickupDateRange?.from?.toISOString() || null;
        })(),
        delivery_datetime: (() => {
          const firstDelivery = pickupsDrops.find(item => item.type === 'delivery');
           if (firstDelivery?.dateRange?.from && firstDelivery?.startTime) {
             const result = combineDateAndTime(firstDelivery.dateRange.from, firstDelivery.startTime);
             console.log('Delivery datetime:', { startTime: firstDelivery.startTime, dateFrom: firstDelivery.dateRange.from, result });
             return result;
          }
          return deliveryDateRange?.from?.toISOString() || null;
        })(),
        delivery_end_datetime: (() => {
          const firstDelivery = pickupsDrops.find(item => item.type === 'delivery');
           if (firstDelivery?.dateRange?.to && firstDelivery?.endTime) {
             const result = combineDateAndTime(firstDelivery.dateRange.to, firstDelivery.endTime);
             console.log('Delivery end datetime:', { 
               endTime: firstDelivery.endTime, 
               dateTo: firstDelivery.dateRange.to, 
               dateFrom: firstDelivery.dateRange.from,
               areSameDate: firstDelivery.dateRange.from?.getTime() === firstDelivery.dateRange.to?.getTime(),
               result 
             });
             return result;
          }
          return deliveryDateRange?.to?.toISOString() || deliveryDateRange?.from?.toISOString() || null;
        })(),
        freight_amount: freightAmount ? parseFloat(freightAmount) : null,
        driver_price: driverPrice ? parseFloat(driverPrice) : null,
        tonu: tonu ? parseFloat(tonu) : null,
        loaded_miles: loadedMiles ? parseInt(loadedMiles) : null,
        dh_miles: dhMiles ? parseInt(dhMiles) : null,
        mileage: ((parseInt(dhMiles) || 0) + (parseInt(loadedMiles) || 0)) || null,
        booked_by: profile?.full_name || profile?.email || 'Unknown User'
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
          // Parse city, state, and zip from address
          let city = null;
          let state = null;
          let zipCode = null;
          let cleanAddress = item.address;
          
          // Check if address has newline format: "Street Address\nCity, State Zip"
          if (item.address.includes('\n')) {
            const lines = item.address.split('\n');
            cleanAddress = lines[0].trim();
            
            if (lines[1]) {
              const cityStateZip = lines[1].trim();
              const match = cityStateZip.match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
              if (match) {
                city = match[1].trim();
                state = match[2].trim();
                zipCode = match[3].trim();
              }
            }
          } else {
            // Fallback to comma-separated parsing
            const addressParts = item.address.split(',').map(part => part.trim());
            
            if (addressParts.length >= 3) {
              // Format: "Street Address, City, State Zip" or "Street Address, City, State"
              cleanAddress = addressParts[0];
              city = addressParts[1];
              const stateZip = addressParts[2];
              const stateZipMatch = stateZip.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
              if (stateZipMatch) {
                state = stateZipMatch[1];
                zipCode = stateZipMatch[2];
              } else {
                state = stateZip;
              }
            } else if (addressParts.length === 2) {
              // Format: "Street Address, City State Zip"
              cleanAddress = addressParts[0];
              const cityState = addressParts[1];
              const cityStateMatch = cityState.match(/^(.+?)\s+([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
              if (cityStateMatch) {
                city = cityStateMatch[1];
                state = cityStateMatch[2];
                zipCode = cityStateMatch[3] || null;
              } else {
                city = cityState;
              }
            }
          }
          
          return {
            order_id: orderId,
            type: item.type,
            address: cleanAddress,
            city,
            state,
            zip_code: zipCode,
            datetime: item.dateRange?.from && item.startTime 
              ? combineDateAndTime(item.dateRange.from, item.startTime)
              : item.dateRange?.from?.toISOString() || null
          };
        });
        if (pickupDropData.length > 0) {
          const { error: pickupDropError } = await supabase.from('pickup_drops').insert(pickupDropData);
          if (pickupDropError) throw pickupDropError;
        }
      }

      toast({
        title: "Order Created",
        description: `Order ${newInternalLoadNumber} has been successfully created.`
      });

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

  const isLoading = companiesLoading || brokersLoading || trucksLoading || driversLoading || loadingNextNumber;
  
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
            <CardTitle className="text-2xl font-semibold">Create New Order</CardTitle>
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
                      onClick={handleExtractWithAI}
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
                  
                  <input 
                    ref={rcFileInputRef}
                    type="file" 
                    multiple 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setRcFiles(e.target.files)} 
                    className="hidden"
                  />
                  <p className="text-xs text-blue-600">Supports PDF, JPG, JPEG, PNG. AI extraction works only with PDF files.</p>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company">Booked by Company</Label>
                <Combobox 
                  options={companyOptions} 
                  value={bookedByCompany} 
                  onValueChange={setBookedByCompany} 
                  placeholder="Select company" 
                  searchPlaceholder="Search companies..." 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="broker">Broker</Label>
                <Combobox 
                  options={brokerOptions} 
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
                  placeholder="Select truck" 
                  searchPlaceholder="Search trucks..." 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailer">Trailer # (Auto-filled)</Label>
                <Input 
                  id="trailer" 
                  placeholder="Trailer number" 
                  value={trailer} 
                  onChange={e => setTrailer(e.target.value)} 
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
                                  <span className={cn("px-2 py-1 rounded text-xs font-medium",
                                    item.type === "pickup" 
                                      ? "bg-blue-100 text-blue-700" 
                                      : "bg-green-100 text-green-700"
                                  )}>
                                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                  </span>
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
                                  <Label htmlFor={`address-${item.id}`}>Address</Label>
                                  <Textarea
                                    id={`address-${item.id}`}
                                    placeholder="Full address"
                                    value={item.address}
                                    onChange={(e) => updatePickupDrop(item.id, 'address', e.target.value)}
                                    className="min-h-[60px]"
                                  />
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

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline">Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Order
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default NewOrder;