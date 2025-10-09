import { useState, useEffect, useRef } from "react";
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
import { Plus, Trash2, Loader2, GripVertical, ArrowLeft, Sparkles, Upload, FileText } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/hooks/useCompanies";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuthContext } from "@/contexts/AuthContext";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { combineDateAndTime, toLocalISOString } from "@/utils/dateUtils";

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
}

const EditOrder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthContext();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form states
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
  const [detention, setDetention] = useState("");
  const [layover, setLayover] = useState("");
  const [extraStop, setExtraStop] = useState("");
  const [lumper, setLumper] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [driverPrice, setDriverPrice] = useState("");
  const [tonu, setTonu] = useState("");
  const [dhMiles, setDhMiles] = useState("");
  const [loadedMiles, setLoadedMiles] = useState("");
  const [pickupsDrops, setPickupsDrops] = useState<PickupDrop[]>([]);
  const [rcFiles, setRcFiles] = useState<FileList | null>(null);
  const [bolFiles, setBolFiles] = useState<FileList | null>(null);
  const [podFiles, setPodFiles] = useState<FileList | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<FileList | null>(null);
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [bookedBy, setBookedBy] = useState("");
  const [invoiced, setInvoiced] = useState("");
  const [internalLoadNumber, setInternalLoadNumber] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

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
  const { data: companies } = useCompanies();
  const { data: trucks } = useTrucks();
  const { data: drivers } = useDrivers();
  const [profiles, setProfiles] = useState<Array<{id: string, full_name: string}>>([]);

  // Fetch profiles for booked by dropdown
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .not('full_name', 'is', null)
        .order('full_name');
      if (data) {
        setProfiles(data);
      }
    };
    fetchProfiles();
  }, []);

  // Load order data
  useEffect(() => {
    console.log('EditOrder useEffect - id parameter:', id);
    console.log('Current window location:', window.location.href);
    
    if (id && id !== ':id') {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        console.error('Invalid order ID format:', id);
        toast({
          title: "Error",
          description: "Invalid order ID format",
          variant: "destructive",
        });
        navigate('/orders');
        return;
      }
      loadOrderData();
    } else {
      console.error('No valid order ID provided. Received:', id);
      toast({
        title: "Error",
        description: "No valid order ID provided in URL",
        variant: "destructive",
      });
      navigate('/orders');
    }
  }, [id]);

  const loadOrderData = async () => {
    console.log('Loading order data for ID:', id);
    console.log('Current URL:', window.location.href);
    
    // Check if id is valid UUID format
    if (!id || id === ':id' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      console.error('Invalid or missing order ID:', id);
      toast({
        title: "Invalid Order ID",
        description: "The order ID in the URL is invalid or missing",
        variant: "destructive",
      });
      navigate('/orders');
      return;
    }
    
    try {
      const { data: orderData, error } = await supabase
        .from('orders')
        .select(`
          *,
          pickup_drops(*),
          order_files(*),
          trailer:trailer_id(trailer_number)
        `)
        .eq('id', id)
        .single();

      console.log('Order data response:', { orderData, error });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (orderData) {
        console.log('Setting form data with order:', orderData);
        
        // Check if order is locked and redirect if it is
        if (orderData.locked) {
          console.log('Order is locked, redirecting to orders page');
          toast({
            title: "Order Locked",
            description: "This order is locked and cannot be edited",
            variant: "destructive",
          });
          navigate('/orders');
          return;
        }
        
        setIsLocked(orderData.locked || false);
        setBookedByCompany(orderData.company_id || "");
        setBroker(orderData.broker_id || "");
        setTruck(orderData.truck_id || "");
        setTrailer(orderData.trailer?.trailer_number || "");
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
        setNotes(orderData.notes || "");
        setBookedBy(orderData.booked_by || "");
        setInvoiced(orderData.invoiced ? "Done" : "false");
        setInternalLoadNumber(orderData.internal_load_number?.toString() || "");

        // Calculate miles from loaded_miles and dh_miles or use legacy mileage
        const loadedMilesValue = (orderData as any).loaded_miles || 0;
        const dhMilesValue = (orderData as any).dh_miles || 0;
        const totalMiles = loadedMilesValue + dhMilesValue || orderData.mileage || 0;
        
        setLoadedMiles(loadedMilesValue.toString());
        setDhMiles(dhMilesValue.toString());

        // Load pickup/drops
        if (orderData.pickup_drops) {
          console.log('Processing pickup_drops:', orderData.pickup_drops);
          const transformedPickupsDrops = orderData.pickup_drops.map((pd: any) => {
            // Reconstruct full address from parts
            let fullAddress = pd.address || "";
            if (pd.city || pd.state || pd.zip_code) {
              const addressParts = [pd.address];
              if (pd.city) addressParts.push(pd.city);
              if (pd.state) {
                if (pd.zip_code) {
                  addressParts.push(`${pd.state} ${pd.zip_code}`);
                } else {
                  addressParts.push(pd.state);
                }
              } else if (pd.zip_code) {
                addressParts.push(pd.zip_code);
              }
              fullAddress = addressParts.filter(Boolean).join(', ');
            }

            // Create date range from datetime field - each stop uses its own datetime
            let dateRange: DateRange | undefined = undefined;
            let startTime = "";
            let endTime = "";
            
            if (pd.datetime) {
              const dateObj = new Date(pd.datetime);
              startTime = dateObj.toTimeString().slice(0, 5);
              endTime = startTime; // Each stop uses its own datetime for both start and end
              dateRange = { from: dateObj, to: dateObj };
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
              address: fullAddress,
              datetime: pd.datetime ? new Date(pd.datetime).toISOString().slice(0, 16) : "",
              dateRange,
              startTime,
              endTime,
              city: pd.city || "",
              state: pd.state || "",
              zipCode: pd.zip_code || ""
            };
          });
          setPickupsDrops(transformedPickupsDrops);
          console.log('Set pickupsDrops to:', transformedPickupsDrops);
        }

        // Load existing files
        if (orderData.order_files) {
          setExistingFiles(orderData.order_files);
        }
        
        console.log('Data loading completed successfully');
      }
    } catch (error) {
      console.error('Error loading order:', error);
      toast({
        title: "Error",
        description: "Failed to load order data",
        variant: "destructive",
      });
      navigate('/orders');
    } finally {
      console.log('Setting loading to false');
      setIsLoading(false);
    }
  };

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

  const updatePickupDropTime = (id: string, timeType: 'startTime' | 'endTime', time: string) => {
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
      
      if (extractedData.pickupAddress) {
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
      
      if (extractedData.deliveryAddress) {
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
        description: `Extracted ${response.data.fieldsExtracted} fields from PDF. Please review and adjust as needed.`
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Update order
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          broker_load_number: brokerLoadNumber || null,
          company_id: bookedByCompany || null,
          broker_id: broker || null,
          truck_id: truck || null,
          trailer_id: truck && trucks ? trucks.find(t => t.id === truck)?.trailer_id || null : null,
          driver1_id: driver1 || null,
          driver2_id: driver2 || null,
          freight_amount: freightAmount ? parseFloat(freightAmount) : null,
          detention: detention ? parseFloat(detention) : null,
          layover: layover ? parseFloat(layover) : null,
          extra_stop: extraStop ? parseFloat(extraStop) : null,
          lumper: lumper ? parseFloat(lumper) : null,
          late_fee: lateFee ? parseFloat(lateFee) : null,
          driver_price: driverPrice ? parseFloat(driverPrice) : null,
          tonu: tonu ? parseFloat(tonu) : null,
          loaded_miles: loadedMiles ? parseInt(loadedMiles) : null,
          dh_miles: dhMiles ? parseInt(dhMiles) : null,
          mileage: (parseInt(loadedMiles) || 0) + (parseInt(dhMiles) || 0) || null,
          notes: notes || null,
          booked_by: bookedBy || null,
          invoiced: invoiced === "Done"
        })
        .eq('id', id);

      if (orderError) throw orderError;

      // Upload new files if any
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
            const fileName = `${id}/${category}/${Date.now()}_${file.name}`;
            
            const { error: uploadError } = await supabase.storage
              .from('order-files')
              .upload(fileName, file);
              
            if (uploadError) throw uploadError;
            
            // Save file metadata
            const { error: fileError } = await supabase
              .from('order_files')
              .insert({
                order_id: id,
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

      // Delete existing pickup_drops
      const { error: deleteError } = await supabase
        .from('pickup_drops')
        .delete()
        .eq('order_id', id);

      if (deleteError) throw deleteError;

      // Insert updated pickup/drops
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
          
          // Calculate datetime from date range and time if available
          let datetime = item.datetime || null;
          if (item.dateRange?.from && item.startTime) {
            datetime = combineDateAndTime(item.dateRange.from, item.startTime);
          }
          
          return {
            order_id: id,
            type: item.type,
            address: cleanAddress,
            city,
            state,
            zip_code: zipCode,
            datetime,
            sequence_number: 1,
            contact_name: null,
            contact_phone: null,
            special_instructions: null
          };
        });
        
        if (pickupDropData.length > 0) {
          const { error: pickupDropError } = await supabase
            .from('pickup_drops')
            .insert(pickupDropData);
          if (pickupDropError) throw pickupDropError;
        }
      }

      toast({
        title: "Success",
        description: "Order updated successfully",
      });
      
      navigate('/orders');
    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: "Error",
        description: "Failed to update order",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/orders')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Orders
              </Button>
              <CardTitle className="text-2xl font-semibold">Edit Order</CardTitle>
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
                  placeholder="Select truck" 
                  searchPlaceholder="Search trucks..." 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailer">Trailer #</Label>
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
                <Label htmlFor="driver1">Driver 1</Label>
                <Combobox 
                  options={driverOptions} 
                  value={driver1} 
                  onValueChange={setDriver1} 
                  placeholder="Select primary driver" 
                  searchPlaceholder="Search drivers..." 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver2">Driver 2 (Optional)</Label>
                <Combobox 
                  options={[{ value: "none", label: "None" }, ...driverOptions]} 
                  value={driver2 || "none"} 
                  onValueChange={(value) => setDriver2(value === "none" ? "" : value)} 
                  placeholder="Select second driver" 
                  searchPlaceholder="Search drivers..." 
                />
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="freight-amount">Freight Amount</Label>
                <Input 
                  id="freight-amount" 
                  type="number" 
                  placeholder="Freight amount" 
                  value={freightAmount} 
                  onChange={e => setFreightAmount(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="detention">Detention</Label>
                <Input 
                  id="detention" 
                  type="number" 
                  placeholder="Detention amount" 
                  value={detention} 
                  onChange={e => setDetention(e.target.value)} 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="layover">Layover</Label>
                <Input 
                  id="layover" 
                  type="number" 
                  placeholder="Layover amount" 
                  value={layover} 
                  onChange={e => setLayover(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extra-stop">Extra Stop</Label>
                <Input 
                  id="extra-stop" 
                  type="number" 
                  placeholder="Extra stop amount" 
                  value={extraStop} 
                  onChange={e => setExtraStop(e.target.value)} 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lumper">Lumper</Label>
                <Input 
                  id="lumper" 
                  type="number" 
                  placeholder="Lumper amount" 
                  value={lumper} 
                  onChange={e => setLumper(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="late-fee">Late Fee</Label>
                <Input 
                  id="late-fee" 
                  type="number" 
                  placeholder="Late fee amount" 
                  value={lateFee} 
                  onChange={e => setLateFee(e.target.value)} 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="driver-price">Driver Rate</Label>
                <Input 
                  id="driver-price" 
                  type="number" 
                  placeholder="Driver Rate" 
                  value={driverPrice} 
                  onChange={e => setDriverPrice(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tonu">TONU</Label>
                <Input 
                  id="tonu" 
                  type="number" 
                  placeholder="TONU amount" 
                  value={tonu} 
                  onChange={e => {
                    setTonu(e.target.value);
                    // If TONU has a value, set freight amount, loaded miles, and driver price to 0
                    if (e.target.value && parseFloat(e.target.value) > 0) {
                      setFreightAmount("0");
                      setLoadedMiles("0");
                      setDriverPrice("0");
                    }
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loaded-miles">Loaded Miles</Label>
                <Input 
                  id="loaded-miles" 
                  type="number" 
                  placeholder="Loaded miles" 
                  value={loadedMiles} 
                  onChange={e => setLoadedMiles(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dh-miles">DH Miles</Label>
                <Input 
                  id="dh-miles" 
                  type="number" 
                  placeholder="Deadhead miles" 
                  value={dhMiles} 
                  onChange={e => setDhMiles(e.target.value)} 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoiced">Invoiced Status</Label>
                <Select value={invoiced} onValueChange={setInvoiced}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Not Invoiced</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="booked-by">Booked By</Label>
                <Combobox 
                  options={profiles.map(p => ({ value: p.full_name, label: p.full_name }))} 
                  value={bookedBy} 
                  onValueChange={setBookedBy} 
                  placeholder="Select person" 
                  searchPlaceholder="Search names..." 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                placeholder="Additional notes" 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                rows={4} 
              />
            </div>

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
                dragStates.rc && "border-blue-400 bg-blue-50/50 scale-[1.02]"
              )}
              {...rcDragHandlers}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-blue-700 flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  RC (Rate Confirmation) Upload
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-blue-700">
                    {rcFiles && rcFiles.length > 0 
                      ? `${rcFiles.length} file(s) selected` 
                      : "Click or drag files here"
                    }
                  </p>
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
                  onChange={e => setRcFiles(e.target.files)} 
                  className="hidden"
                />
                <p className="text-xs text-blue-600">Rate confirmation files. AI extraction works only with PDF files.</p>
              </CardContent>
            </Card>

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
              </>
            )}

            {existingFiles.length > 0 && (
              <div className="space-y-2">
                <Label>Existing Files</Label>
                <div className="flex flex-wrap gap-2">
                  {existingFiles.map((file) => (
                    <div key={file.id} className="flex items-center gap-2 p-2 border rounded">
                      <span className="text-sm">{file.file_name} ({file.file_category || 'ADDITIONAL'})</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from('order-files')
                            .createSignedUrl(file.file_path, 60); // 60 second expiry
                          
                          if (error) {
                            toast({
                              title: "Error",
                              description: "Failed to load file: " + error.message,
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          if (data?.signedUrl) {
                            window.open(data.signedUrl, '_blank');
                          }
                        }}
                      >
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          try {
                            // Delete from storage
                            await supabase.storage
                              .from('order-files')
                              .remove([file.file_path]);
                            
                            // Delete from database
                            await supabase
                              .from('order_files')
                              .delete()
                              .eq('id', file.id);
                            
                            // Update local state
                            setExistingFiles(existingFiles.filter(f => f.id !== file.id));
                            
                            toast({
                              title: "File deleted",
                              description: "File has been successfully deleted",
                            });
                          } catch (error) {
                            toast({
                              title: "Error",
                              description: "Failed to delete file",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => navigate('/orders')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Order'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditOrder;