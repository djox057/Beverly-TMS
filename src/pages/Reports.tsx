import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X, ChevronLeft, ChevronRight, Info, Clock, Maximize2, XCircle, UserPlus, History, HelpCircle, Home, Ban, Upload } from "lucide-react";
import { TruckNoteHistoryDialog } from "@/components/TruckNoteHistoryDialog";
import { ArrivalTimeDialog } from "@/components/ArrivalTimeDialog";
import { EditLostDayNoteDialog } from "@/components/EditLostDayNoteDialog";
import { SetDriverStatusDialog } from "@/components/SetDriverStatusDialog";
import { useNavigate } from "react-router-dom";
import { HosCircularTimer } from "@/components/HosCircularTimer";
import { useReports } from "@/hooks/useReports";
import { useDriverDrugTests } from "@/hooks/useDriverDrugTests";
import { useSamsaraLocations } from "@/hooks/useSamsaraLocations";
import { supabase } from "@/integrations/supabase/client";
import React, { useState, useEffect, useMemo, memo, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/components/ui/sidebar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCarousel } from "@/components/ui/calendar-carousel";
import { startOfWeek, addDays, isSameDay, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TruckMapDialog, TruckMapView } from "@/components/TruckMapDialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { parseSimpleDateTime } from "@/utils/dateUtils";
import { DatePicker } from "@/components/ui/date-picker";
import { useDebounce } from "@/hooks/useDebounce";
interface EditingState {
  truckId: string;
  field: "pickup-location" | "pickup-datetime" | "delivery-location" | "delivery-datetime" | "note" | "miles-away";
  value: string;
}
interface DispatcherCalendarState {
  [dispatcherId: string]: Date;
}
interface GameOverDialogState {
  truckId: string;
  truckNumber: string;
  existingDates: string[]; // Dates that already have "game over"
}
type GameOverType = "yard" | "at_road";

// Helper function to get company-based background color for truck cells
const getCompanyBackgroundColor = (companyName: string | null) => {
  if (!companyName) return {};
  const normalizedName = companyName.toUpperCase();
  if (normalizedName.includes("BEVERLY FREIGHT")) {
    return {
      backgroundColor: "hsl(var(--company-beverly-freight))",
      color: "hsl(var(--company-beverly-freight-foreground))"
    };
  } else if (normalizedName.includes("BF PRIME UNITED")) {
    return {
      backgroundColor: "hsl(var(--company-bf-prime-united))",
      color: "hsl(var(--company-bf-prime-united-foreground))"
    };
  } else if (normalizedName.includes("BF PRIME")) {
    return {
      backgroundColor: "hsl(var(--company-bf-prime))",
      color: "hsl(var(--company-bf-prime-foreground))"
    };
  } else if (normalizedName.includes("BEVERLY GROUP")) {
    return {
      backgroundColor: "hsl(var(--company-beverly-group))",
      color: "hsl(var(--company-beverly-group-foreground))"
    };
  } else if (normalizedName.includes("BG PRIME")) {
    return {
      backgroundColor: "hsl(var(--company-bg-prime))",
      color: "hsl(var(--company-bg-prime-foreground))"
    };
  }
  return {};
};
const getStatusBadge = (status: string) => {
  switch (status) {
    case "In Transit":
      return <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-transit))] text-[hsl(var(--cell-transit-foreground))] border border-border">
          In Transit
        </span>;
    case "Loading":
      return <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-loading))] text-[hsl(var(--cell-loading-foreground))] border border-border">
          Loading
        </span>;
    case "Available":
      return <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-available))] text-[hsl(var(--cell-available-foreground))] border border-border">
          Available
        </span>;
    case "Maintenance":
      return <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-maintenance))] text-[hsl(var(--cell-maintenance-foreground))] border border-border">
          Maintenance
        </span>;
    default:
      return <span className="px-1 py-0.5 text-[10px] bg-muted text-muted-foreground border border-border">{status}</span>;
  }
};

// Helper to get current date in Chicago timezone
const getChicagoToday = () => {
  const now = new Date();
  const chicagoTime = toZonedTime(now, "America/Chicago");
  chicagoTime.setHours(0, 0, 0, 0);
  return chicagoTime;
};

// Helper to format documents in order: RC, BOL, POD, Additional (max 1 per category)
const formatDocuments = (documents: Array<{
  category: string;
}>) => {
  const categoryOrder = ["RC", "BOL", "POD", "ADDITIONAL"];
  const foundCategories = new Set<string>();
  const orderedDocs: string[] = [];
  categoryOrder.forEach(category => {
    const doc = documents.find(d => d.category === category && !foundCategories.has(d.category));
    if (doc) {
      foundCategories.add(doc.category);
      orderedDocs.push(doc.category);
    }
  });
  return orderedDocs.length > 0 ? orderedDocs.join(", ") : "None";
};

// EditableNoteField component to avoid hooks violation
const EditableNoteField = ({
  truckId,
  driverId,
  value,
  handleNoteChange,
  setNoteDialogContent,
  setNoteDialogOpen,
  onHistoryClick
}: {
  truckId: string;
  driverId: string | null;
  value: string;
  handleNoteChange: (truckId: string, driverId: string | null, value: string) => Promise<void>;
  setNoteDialogContent: (value: string) => void;
  setNoteDialogOpen: (data: { truckId: string; driverId: string | null } | null) => void;
  onHistoryClick: (driverId: string | null) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  // Update local value when prop changes (e.g., after successful save)
  useEffect(() => {
    if (!isEditing && !isSaving) {
      setLocalValue(value);
    }
  }, [value, isEditing, isSaving]);
  const hasContent = localValue && localValue.trim().length > 0 && localValue.trim() !== "Add note...";
  const handleBlur = async () => {
    if (localValue !== value) {
      setIsSaving(true);
      try {
        await handleNoteChange(truckId, driverId, localValue);
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditing(false);
  };
  return <div className="relative w-full h-full group">
      {isEditing ? <Textarea value={localValue || ""} onChange={e => setLocalValue(e.target.value)} autoFocus onBlur={handleBlur} onKeyDown={e => {
      if (e.key === "Escape") {
        setLocalValue(value); // Reset to original value
        setIsEditing(false);
      }
    }} className={`text-[0.624rem] font-bold border-none rounded-none resize-none text-left ${hasContent ? "bg-purple-500/20" : "bg-transparent"} focus:outline-none focus:ring-0 focus:border-transparent p-1 w-full leading-tight`} style={{
      height: "32px",
      minHeight: "32px",
      maxHeight: "32px",
      boxShadow: "none",
      lineHeight: "14px"
    }} placeholder="Add note..." spellCheck={false} /> : <div onClick={() => setIsEditing(true)} className={`text-[0.624rem] font-bold cursor-text ${hasContent ? "bg-purple-500/20" : "bg-transparent"} p-1 w-full h-full overflow-hidden leading-tight line-clamp-2 ${isSaving ? "opacity-70" : ""}`} style={{
      height: "32px",
      minHeight: "32px",
      maxHeight: "32px",
      lineHeight: "14px",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    }} title={localValue || ""}>
          {hasContent ? localValue : <span className="text-muted-foreground">Add note...</span>}
        </div>}
      {hasContent && !isEditing && <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <History className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground" onClick={e => {
        e.stopPropagation();
        onHistoryClick(driverId);
      }} />
          <Maximize2 className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => {
        setNoteDialogContent(localValue || "");
        setNoteDialogOpen({ truckId, driverId });
      }} />
        </div>}
    </div>;
};
const Reports = () => {
  const {
    profile,
    hasRole
  } = useAuthContext();
  const navigate = useNavigate();
  
  // Load filter values from localStorage
  const [showEmptyTrucks, setShowEmptyTrucks] = useState(() => {
    const saved = localStorage.getItem('reports-showEmptyTrucks');
    return saved ? JSON.parse(saved) : false;
  });
  
  const [showNewDrivers, setShowNewDrivers] = useState(() => {
    const saved = localStorage.getItem('reports-showNewDrivers');
    return saved ? JSON.parse(saved) : false;
  });
  const [drugTestDialog, setDrugTestDialog] = useState<{
    driverId: string;
    driverName: string;
    truckId: string;
  } | null>(null);
  const {
    drugTests,
    upsertDrugTest,
    getDrugTestForDriver
  } = useDriverDrugTests();

  // Helper function to check if a driver is "new" (no loads or exactly 1 load with pickup today)
  const isNewDriver = useCallback((truck: any) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const realOrders = truck.allOrders?.filter((order: any) => order.notes !== "GAME|OVER") || [];

    // Case 1: No loads ever - brand new driver
    if (realOrders.length === 0) {
      return true;
    }

    // Case 2: Exactly 1 load with pickup today - first load starting today
    if (realOrders.length === 1) {
      const order = realOrders[0];
      if (!order.pickupStop?.datetime) return false;
      const pickupDate = new Date(order.pickupStop.datetime);
      pickupDate.setHours(0, 0, 0, 0);
      return isSameDay(pickupDate, today);
    }
    return false;
  }, []);

  // Helper to check if truck has any game over days
  const hasGameOverDays = useCallback((truck: any) => {
    return truck.lost_day_notes?.some((note: any) => {
      const noteText = note.note?.toLowerCase() || "";
      return noteText.includes("game over");
    }) || false;
  }, []);

  // Helper to get driver cell styling (combines drug test and game over styling)
  const getDriverCellStyle = useCallback((truck: any) => {
    // Check for game over first - it takes priority
    if (hasGameOverDays(truck)) {
      return {
        backgroundColor: "black",
        color: "white"
      };
    }
    
    // Otherwise check for drug test styling
    if (!truck.driverId) return {};
    const drugTest = getDrugTestForDriver(truck.driverId);
    const isNew = isNewDriver(truck);
    if (!isNew) return {};
    if (drugTest?.result === "positive") {
      return {
        backgroundColor: "hsl(0, 72%, 53%)",
        color: "white"
      };
    } else if (drugTest?.result === "negative") {
      return {
        backgroundColor: "hsl(142, 76%, 36%)",
        color: "white"
      };
    }
    return {};
  }, [hasGameOverDays, getDrugTestForDriver, isNewDriver]);

  // Note: Drug test notes are now added directly to truck notes when status changes

  // Helper to format datetime without timezone conversion
  const formatDateTime = (datetimeStr: string, formatStr: string) => {
    if (!datetimeStr || datetimeStr === "—") return "—";
    const parsed = parseSimpleDateTime(datetimeStr);
    // Create date from parsed components (no timezone conversion)
    const date = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
    return format(date, formatStr);
  };

  // Helper to format time only
  const formatTime = (datetimeStr: string) => {
    if (!datetimeStr || datetimeStr === "—") return "—";
    const parsed = parseSimpleDateTime(datetimeStr);
    return parsed.timeString;
  };

  // Helper to format time range (or single time if start equals end)
  const formatTimeRange = (datetimeStr: string, endDatetimeStr: string | null | undefined) => {
    if (!datetimeStr || datetimeStr === "—") return "—";
    
    const parsed = parseSimpleDateTime(datetimeStr);
    const startTimeFormatted = `${parsed.hours.toString().padStart(2, '0')}:${parsed.minutes.toString().padStart(2, '0')}`;
    
    // If no end time or end time is "—", just show start time
    if (!endDatetimeStr || endDatetimeStr === "—") return startTimeFormatted;
    
    const parsedEnd = parseSimpleDateTime(endDatetimeStr);
    const endTimeFormatted = `${parsedEnd.hours.toString().padStart(2, '0')}:${parsedEnd.minutes.toString().padStart(2, '0')}`;
    
    // If start and end are the same, only show one time
    if (startTimeFormatted === endTimeFormatted) return startTimeFormatted;
    
    // Otherwise show range
    return `${startTimeFormatted}-${endTimeFormatted}`;
  };

  // Offices list
  const offices = ["Čačak", "KRAGUJEVAC", "BEOGRAD", "Recovery"];

  // Set initial tab based on user's office, default to "Čačak" if not found
  const getInitialTab = () => {
    if (profile?.office && offices.includes(profile.office)) {
      return profile.office;
    }
    return "Čačak";
  };
  const {
    data: groupedReports,
    isLoading,
    error,
    updateTruckStatus,
    updateTruckMilesAway,
    updateTruckNote,
    updatePickupDrop,
    updateLostDayNote,
    updatePickupDropArrival,
    markGoingToPickup,
    markGoingToDelivery
  } = useReports();
  const {
    data: samsaraLocations,
    isLoading: isLoadingSamsara
  } = useSamsaraLocations();
  const queryClient = useQueryClient();

  // Delete lost day note mutation
  const deleteLostDayNote = useMutation({
    mutationFn: async ({
      driverId,
      date
    }: {
      driverId: string;
      date: string;
    }) => {
      const {
        error
      } = await supabase.from("lost_day_notes").delete().eq("driver_id", driverId).eq("date", date);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["reports"]
      });
    }
  });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [calendarDates, setCalendarDates] = useState<DispatcherCalendarState>({});
  const [expandedTruckMap, setExpandedTruckMap] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(getInitialTab());
  const [visibleTrucks, setVisibleTrucks] = useState<{
    [dispatcherId: string]: number;
  }>({});
  const [noteDialogOpen, setNoteDialogOpen] = useState<{ truckId: string; driverId: string | null } | null>(null);
  const [noteDialogContent, setNoteDialogContent] = useState<string>("");
  const [historyDialogDriverId, setHistoryDialogDriverId] = useState<string | null>(null);
  const [truckMapView, setTruckMapView] = useState<{
    truckNumber: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [gameOverDialog, setGameOverDialog] = useState<GameOverDialogState | null>(null);
  const [lateDeliveries, setLateDeliveries] = useState<Set<string>>(new Set());
  
  const [truckDriverFilter, setTruckDriverFilter] = useState(() => {
    return localStorage.getItem('reports-truckDriverFilter') || "";
  });
  
  const [dispatchNameFilter, setDispatchNameFilter] = useState(() => {
    return localStorage.getItem('reports-dispatchNameFilter') || "";
  });
  
  const [loadNumberFilter, setLoadNumberFilter] = useState(() => {
    return localStorage.getItem('reports-loadNumberFilter') || "";
  });
  const [zoomedLoad, setZoomedLoad] = useState<{
    orderId: string;
    loadNumber: string;
    brokerLoadNumber: string;
    allPickupStops: any[];
    allDeliveryStops: any[];
    documents: string[];
    notes: string;
    truckNumber: string;
    driverNames: string;
  } | null>(null);
  const [legendDialogOpen, setLegendDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelFormData, setCancelFormData] = useState({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [arrivalTimeDialog, setArrivalTimeDialog] = useState<{
    pickupDropId: string;
    type: "pickup" | "delivery";
  } | null>(null);
  const [homeTimeDialog, setHomeTimeDialog] = useState<{
    truckId: string;
    truckNumber: string;
    driverId: string;
    date: string;
    isCurrentlyHomeTime: boolean;
  } | null>(null);
  
  const [redCellDialog, setRedCellDialog] = useState<{
    truckId: string;
    truckNumber: string;
    driverId: string;
    date: string;
    currentNote: string;
  } | null>(null);
  const [redCellNote, setRedCellNote] = useState("");
  const [redCellIsHomeTime, setRedCellIsHomeTime] = useState(false);

  // Helper function to check if 5 seconds have passed since button click
  const has5SecondsPassed = (timestamp: string | null | undefined): boolean => {
    if (!timestamp) return false;
    const clickTime = new Date(timestamp).getTime();
    const now = new Date().getTime();
    return now - clickTime >= 5000;
  };

  // Helper to check if any previous orders are missing POD (delivery not completed)
  const hasPreviousOrdersWithoutPOD = (truck: any | null, currentOrder: any): boolean => {
    if (!truck || !truck.allOrders || !currentOrder) return false;
    
    // Find orders that came before the current one and don't have POD
    return truck.allOrders.some((order: any) => {
      // Skip the current order
      if (order.id === currentOrder.id) return false;
      
      // Skip GAME-OVER orders
      if (order.notes === 'GAME|OVER') return false;
      
      // Check if this order has BOL but no POD (incomplete delivery)
      const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
      const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
      
      return hasBOL && !hasPOD;
    });
  };

  // Helper to determine if we should show Going to Pickup button
  const shouldShowGoingToPickup = (order: any, stop: any, truck: any | null = null): boolean => {
    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToPickupClicked = !!stop.going_to_at;
    const hasIncompleteDeliveries = hasPreviousOrdersWithoutPOD(truck, order);

    // Don't show if stuck on previous load (has incomplete deliveries)
    if (hasIncompleteDeliveries) return false;
    
    // Show if no BOL and Going to Pickup hasn't been clicked for this stop
    return !hasBOL && !goingToPickupClicked;
  };

  // Helper to determine if we should show At Pickup button
  const shouldShowAtPickup = (order: any, stop: any, truck: any | null = null): boolean => {
    if (stop.arrived_at) return false; // Already arrived

    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToPickupClicked = !!stop.going_to_at;
    const fiveSecondsPassed = has5SecondsPassed(stop.going_to_at);
    const hasIncompleteDeliveries = hasPreviousOrdersWithoutPOD(truck, order);

    // Don't show if stuck on previous load (has incomplete deliveries)
    if (hasIncompleteDeliveries) return false;
    
    // Show if Going to Pickup clicked AND 5 seconds have passed AND no BOL yet
    return goingToPickupClicked && fiveSecondsPassed && !hasBOL;
  };

  // Helper to determine if we should show Going to Delivery button
  const shouldShowGoingToDelivery = (order: any, stop: any, truck: any | null = null): boolean => {
    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToDeliveryClicked = !!stop.going_to_at;

    // CRITICAL FIX: If "Going to Delivery" was clicked, hide the button
    // This allows the truck to move forward even if previous POD is missing
    if (goingToDeliveryClicked) return false;
    
    // Show if has BOL and hasn't clicked yet
    // Don't check for incomplete deliveries - user can override by clicking
    return hasBOL;
  };

  // Helper to determine if we should show At Delivery button  
  const shouldShowAtDelivery = (order: any, stop: any, truck: any | null = null): boolean => {
    if (stop.arrived_at) return false; // Already arrived

    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToDeliveryClicked = !!stop.going_to_at;
    const fiveSecondsPassed = has5SecondsPassed(stop.going_to_at);

    // CRITICAL FIX: Show "At Delivery" if:
    // 1. "Going to Delivery" was clicked AND 5 seconds passed, OR
    // 2. Has BOL AND 5 seconds passed (for backward compatibility)
    // This allows the truck to proceed even if previous POD is missing
    return (hasBOL || goingToDeliveryClicked) && fiveSecondsPassed;
  };

  // Helper to get all load details for zoom dialog
  const getLoadDetailsForZoom = useCallback((orderId: string, truck: any) => {
    const order = truck.allOrders?.find((o: any) => o.id === orderId);
    if (!order) return null;
    return {
      orderId: order.id,
      loadNumber: order.loadDetails.loadNumber,
      brokerLoadNumber: order.loadDetails.brokerLoadNumber,
      allPickupStops: order.pickupStops || [],
      allDeliveryStops: order.deliveryStops || [],
      documents: (order.loadDetails.documents || []).map((d: any) => d.category),
      notes: order.loadDetails.notes,
      truckNumber: truck.truckNumber,
      driverNames: truck.driverNames
    };
  }, []);

  // File upload handlers
  const handleDocumentClick = (docType: string, isChecked: boolean) => {
    if (!isChecked) {
      setUploadDocType(docType);
      setUploadFiles([]);
      setUploadDialogOpen(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      setUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUploadDocument = async () => {
    if (!uploadFiles.length || !zoomedLoad?.orderId) return;

    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', user?.id || '')
        .single();

      // Upload all files
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const fileName = `${zoomedLoad.orderId}/${uploadDocType}/${Date.now()}_${file.name}`;

        // Upload file to storage
        const { error: uploadError } = await supabase.storage
          .from('order-files')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Insert into order_files table
        const { error: fileError } = await supabase
          .from('order_files')
          .insert({
            order_id: zoomedLoad.orderId,
            file_name: file.name,
            file_path: fileName,
            file_size: file.size,
            content_type: file.type,
            file_category: uploadDocType,
            uploaded_by: profile?.full_name || profile?.email || "Unknown User"
          });

        if (fileError) throw fileError;
      }

      toast({
        title: "Success",
        description: `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} uploaded successfully`,
      });

      // Refresh the reports data
      queryClient.invalidateQueries({ queryKey: ['reports'] });

      // Close dialog and reset state
      setUploadDialogOpen(false);
      setUploadFiles([]);
      setUploadDocType("");

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Cancel order handlers
  const handleCancelOrder = async () => {
    if (!zoomedLoad?.orderId) return;

    try {
      // Validate inputs
      const tonu = parseFloat(cancelFormData.tonu);
      const driverRate = parseFloat(cancelFormData.driverRate);
      const dhMiles = parseInt(cancelFormData.dhMiles);

      if (isNaN(tonu) || isNaN(driverRate) || isNaN(dhMiles)) {
        toast({
          title: "Error",
          description: "Please enter valid numbers for all fields",
          variant: "destructive"
        });
        return;
      }

      if (!cancelFormData.notes.trim()) {
        toast({
          title: "Error",
          description: "Notes are required",
          variant: "destructive"
        });
        return;
      }

      // First, get current order values to backup
      const { data: currentOrder, error: fetchError } = await supabase
        .from('orders')
        .select('freight_amount, driver_price, loaded_miles, dh_miles, tonu, tonu_driver, notes')
        .eq('id', zoomedLoad.orderId)
        .single();

      if (fetchError) throw fetchError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Save backup of original values
      const { error: backupError } = await supabase
        .from('canceled_orders_backup')
        .insert({
          order_id: zoomedLoad.orderId,
          canceled_by: user?.id,
          original_freight_amount: currentOrder.freight_amount,
          original_driver_price: currentOrder.driver_price,
          original_loaded_miles: currentOrder.loaded_miles,
          original_dh_miles: currentOrder.dh_miles,
          original_tonu: currentOrder.tonu,
          original_tonu_driver: currentOrder.tonu_driver,
          original_notes: currentOrder.notes,
          cancel_tonu: tonu,
          cancel_driver_rate: driverRate,
          cancel_dh_miles: dhMiles,
          cancel_notes: cancelFormData.notes
        });

      if (backupError) throw backupError;

      // Update order with cancel values
      const { error } = await supabase
        .from('orders')
        .update({
          tonu: tonu,
          tonu_driver: tonu,
          driver_price: driverRate,
          dh_miles: dhMiles,
          notes: cancelFormData.notes,
          freight_amount: 0,
          loaded_miles: 0,
          canceled: true
        })
        .eq('id', zoomedLoad.orderId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Load cancelled successfully"
      });
      setCancelDialogOpen(false);
      setCancelFormData({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
      setZoomedLoad(null);
      
      // Refresh reports list
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast({
        title: "Error",
        description: "Failed to cancel load",
        variant: "destructive"
      });
    }
  };

  // Save filter values to localStorage when they change
  useEffect(() => {
    localStorage.setItem('reports-showEmptyTrucks', JSON.stringify(showEmptyTrucks));
  }, [showEmptyTrucks]);

  useEffect(() => {
    localStorage.setItem('reports-showNewDrivers', JSON.stringify(showNewDrivers));
  }, [showNewDrivers]);

  useEffect(() => {
    localStorage.setItem('reports-truckDriverFilter', truckDriverFilter);
  }, [truckDriverFilter]);

  useEffect(() => {
    localStorage.setItem('reports-dispatchNameFilter', dispatchNameFilter);
  }, [dispatchNameFilter]);

  useEffect(() => {
    localStorage.setItem('reports-loadNumberFilter', loadNumberFilter);
  }, [loadNumberFilter]);

  // Debounce filter values to prevent lag
  const debouncedTruckDriverFilter = useDebounce(truckDriverFilter, 300);
  const debouncedDispatchNameFilter = useDebounce(dispatchNameFilter, 300);
  const debouncedLoadNumberFilter = useDebounce(loadNumberFilter, 300);

  // Force re-render every 30 seconds to update button visibility (optimized from 5s)
  useEffect(() => {
    const interval = setInterval(() => {
      // Invalidate to trigger button visibility updates
      queryClient.invalidateQueries({
        queryKey: ['reports']
      });
    }, 30000); // Changed from 5000ms to 30000ms
    return () => clearInterval(interval);
  }, [queryClient]);
  const {
    toast
  } = useToast();
  const {
    open: sidebarOpen
  } = useSidebar();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const INITIAL_TRUCK_COUNT = 12;
  const LOAD_MORE_COUNT = 6;

  // Initialize visible trucks count when data loads
  useEffect(() => {
    if (groupedReports) {
      const initialCounts: {
        [key: string]: number;
      } = {};
      groupedReports.forEach(group => {
        initialCounts[group.dispatcherId] = INITIAL_TRUCK_COUNT;
      });
      setVisibleTrucks(initialCounts);
    }
  }, [groupedReports]);

  // Setup intersection observer for lazy loading
  const handleLoadMore = useCallback((dispatcherId: string) => {
    setVisibleTrucks(prev => ({
      ...prev,
      [dispatcherId]: (prev[dispatcherId] || INITIAL_TRUCK_COUNT) + LOAD_MORE_COUNT
    }));
  }, []);

  // Miles away are now calculated by a background job every 10 minutes

  const handleEdit = (truckId: string, field: "pickup-location" | "pickup-datetime" | "delivery-location" | "delivery-datetime" | "note" | "miles-away", currentValue: string) => {
    setEditing({
      truckId,
      field,
      value: currentValue
    });
  };
  const handleSave = async () => {
    if (!editing) return;
    try {
      // Find the truck to get orderId and pickup/delivery stop IDs
      const allTrucks = Object.values(groupedReports || {}).flatMap(group => group.trucks);
      const truck = allTrucks.find(t => t.id === editing.truckId);
      
      if (editing.field === "miles-away") {
        const milesValue = parseFloat(editing.value);
        if (isNaN(milesValue) || milesValue < 0) {
          toast({
            title: "Invalid value",
            description: "Please enter a valid number for miles away",
            variant: "destructive"
          });
          return;
        }
        await updateTruckMilesAway.mutateAsync({
          truckId: editing.truckId,
          milesAway: milesValue
        });
      } else if (editing.field === "note") {
        await updateTruckNote.mutateAsync({
          truckId: truck.id,
          note: editing.value
        });
      } else if (editing.field.startsWith("pickup-") && truck?.pickup.id) {
        const updates: any = {};
        if (editing.field === "pickup-location") {
          updates.address = editing.value;
        } else if (editing.field === "pickup-datetime") {
          const dt = new Date(editing.value);
          updates.datetime = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:00`;
        }
        await updatePickupDrop.mutateAsync({
          pickupDropId: truck.pickup.id,
          address: updates.address || truck.pickup.location,
          ...(updates.datetime && {
            datetime: updates.datetime
          })
        });
      } else if (editing.field.startsWith("delivery-") && truck?.delivery.id) {
        const updates: any = {};
        if (editing.field === "delivery-location") {
          updates.address = editing.value;
        } else if (editing.field === "delivery-datetime") {
          const dt = new Date(editing.value);
          updates.datetime = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:00`;
        }
        await updatePickupDrop.mutateAsync({
          pickupDropId: truck.delivery.id,
          address: updates.address || truck.delivery.location,
          ...(updates.datetime && {
            datetime: updates.datetime
          })
        });
      }
      toast({
        title: "Updated successfully",
        description: `${editing.field.replace("-", " ")} has been updated.`
      });
      setEditing(null);
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the field.",
        variant: "destructive"
      });
    }
  };
  const handleCancel = () => {
    setEditing(null);
  };
  const getCalendarStartDate = (dispatcherId: string) => {
    if (calendarDates[dispatcherId]) {
      return calendarDates[dispatcherId];
    }
    // Default to 2 days before current day to show 6 days
    return addDays(new Date(), -2);
  };
  const handleCalendarDateChange = (dispatcherId: string, newDate: Date) => {
    setCalendarDates(prev => ({
      ...prev,
      [dispatcherId]: newDate
    }));
  };
  const getStatusColors = (status: string) => {
    switch (status) {
      case "In Transit":
        return {
          bg: "bg-[hsl(var(--cell-transit))]",
          text: "text-[hsl(var(--cell-transit-foreground))]",
          border: "border-border"
        };
      case "Loading":
        return {
          bg: "bg-[hsl(var(--cell-loading))]",
          text: "text-[hsl(var(--cell-loading-foreground))]",
          border: "border-border"
        };
      case "Available":
        return {
          bg: "bg-[hsl(var(--cell-available))]",
          text: "text-[hsl(var(--cell-available-foreground))]",
          border: "border-border"
        };
      case "Maintenance":
        return {
          bg: "bg-[hsl(var(--cell-maintenance))]",
          text: "text-[hsl(var(--cell-maintenance-foreground))]",
          border: "border-border"
        };
      default:
        return {
          bg: "bg-muted",
          text: "text-muted-foreground",
          border: "border-border"
        };
    }
  };
  const renderTruckCalendarCells = (truck: any, startDate: Date, truckIndex: number, totalTrucks: number) => {
    const isFirstTruck = truckIndex === 0;
    const isLastTruck = truckIndex === totalTrucks - 1;
    const days = Array.from({
      length: 6
    }, (_, i) => addDays(startDate, i));
    const parseDate = (dateStr: string) => {
      if (dateStr === "—" || !dateStr) return null;
      try {
        return new Date(dateStr);
      } catch {
        return null;
      }
    };

    // Helper to get pickup cell color based on status and previous load
    const getPickupCellColor = (order: any, previousLoadDeliveryComplete: boolean) => {
      // Check if this is a recovery load first - purple background
      if (order.is_recovery) return "bg-purple-500/80 text-white border-purple-500/50";
      
      const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
      const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
      const hasArrived = order.pickupStop?.arrived_at;
      if (hasBOL || hasPOD) return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
      if (hasArrived) return "bg-[hsl(var(--cell-active))] text-[hsl(var(--cell-active-foreground))] border-border";
      if (previousLoadDeliveryComplete) return "bg-[#00FFFF] text-black border-border";
      return "bg-[hsl(var(--cell-pending))] text-[hsl(var(--cell-pending-foreground))] border-border";
    };

    // Helper to get delivery cell color based on status
    const getDeliveryCellColor = (order: any, stop?: any) => {
      // Check if this is a recovery load first - purple background
      if (order.is_recovery) return "bg-purple-500/80 text-white border-purple-500/50";
      
      const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
      const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
      const hasArrived = stop?.arrived_at;
      const isLate = lateDeliveries.has(order.id);
      
      // For multi-drop loads: POD should only turn the corresponding delivery dark green
      // Get all delivery stops sorted by sequence_number
      const deliveryStops = order.deliveryStops || order.pickup_drops?.filter((pd: any) => pd.type === "delivery").sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)) || [];
      
      // Count POD files
      const podCount = order.order_files?.filter((file: any) => file.file_category === "POD").length || 0;
      
      // If there are multiple delivery stops and we have a specific stop
      if (deliveryStops.length > 1 && stop) {
        // Find the index of this stop
        const stopIndex = deliveryStops.findIndex((s: any) => s.id === stop.id);
        
        // Only turn dark green if we have enough PODs for this delivery (1 POD per delivery in sequence)
        if (podCount > stopIndex) {
          return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
        }
      } else {
        // Single delivery or no specific stop - use original logic
        if (hasPOD) return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
      }

      // Check if ETA is late BEFORE checking other BOL statuses
      if (isLate) return "bg-[hsl(var(--cell-late))] text-[hsl(var(--cell-late-foreground))] border-border";
      if (hasBOL && hasArrived) return "bg-[hsl(var(--cell-active))] text-[hsl(var(--cell-active-foreground))] border-border";
      if (hasBOL) return "bg-[hsl(var(--cell-lime))] text-[hsl(var(--cell-lime-foreground))] border-border";
      return "bg-[hsl(var(--cell-pending))] text-[hsl(var(--cell-pending-foreground))] border-border";
    };

    // Helper function to get lost day note for a specific date
    const getLostDayNote = (date: Date): string => {
      const dateStr = format(date, "yyyy-MM-dd");
      const lostDayNote = truck.lost_day_notes?.find((note: any) => note.date === dateStr);

      // If no existing note, check if this is 1 day in future
      if (!lostDayNote) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        const oneDayFuture = addDays(today, 1);
        if (isSameDay(checkDate, oneDayFuture)) {
          return "No pre-book 🥺?";
        }
        // Show "Empty" for current day, "Lost day" for other days
        if (isSameDay(checkDate, today)) {
          return "Empty";
        }
        return "Lost day";
      }
      
      // If note_type is home_time, return "Home Time" regardless of note value
      if (lostDayNote.note_type === 'home_time') {
        return "Home Time";
      }
      
      return lostDayNote.note || "Lost day";
    };

    // Helper function to check if a date has "game over" note (any type)
    const isGameOverDay = (date: Date): {
      isGameOver: boolean;
      type: GameOverType | null;
    } => {
      const dateStr = format(date, "yyyy-MM-dd");
      const lostDayNote = truck.lost_day_notes?.find((note: any) => note.date === dateStr);
      const note = lostDayNote?.note?.toLowerCase();
      if (note === "game over - yard") return {
        isGameOver: true,
        type: "yard"
      };
      if (note === "game over - at road") return {
        isGameOver: true,
        type: "at_road"
      };
      return {
        isGameOver: false,
        type: null
      };
    };

    // Helper function to check if pickup and delivery are on the same date
    const isSameDayPickupDelivery = (order: any) => {
      return order.pickupDate && order.deliveryDate && isSameDay(order.pickupDate, order.deliveryDate);
    };

    // Get all orders with their pickup/delivery dates sorted chronologically
    const ordersWithDates = truck.allOrders?.map((order: any) => {
      // Parse datetime without timezone conversion
      const pickupDate = order.pickup_datetime ? (() => {
        const parsed = parseSimpleDateTime(order.pickup_datetime);
        return new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
      })() : null;
      const deliveryDate = order.delivery_datetime ? (() => {
        const parsed = parseSimpleDateTime(order.delivery_datetime);
        return new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
      })() : null;

      // Count pickup and delivery stops for this order on each date
      const pickupStopsByDate = new Map<string, number>();
      const deliveryStopsByDate = new Map<string, number>();
      order.pickupStops?.forEach((stop: any) => {
        if (stop.datetime) {
          const stopDate = formatDateTime(stop.datetime, "yyyy-MM-dd");
          pickupStopsByDate.set(stopDate, (pickupStopsByDate.get(stopDate) || 0) + 1);
        }
      });
      order.deliveryStops?.forEach((stop: any) => {
        if (stop.datetime) {
          const stopDate = formatDateTime(stop.datetime, "yyyy-MM-dd");
          deliveryStopsByDate.set(stopDate, (deliveryStopsByDate.get(stopDate) || 0) + 1);
        }
      });
      return {
        ...order,
        pickupDate,
        deliveryDate,
        pickupStopsByDate,
        deliveryStopsByDate,
        pickupLocation: order.pickupStop ? order.pickupStop.city && order.pickupStop.state ? `${order.pickupStop.city}, ${order.pickupStop.state}` : order.pickupStop.address || "—" : "—",
        deliveryLocation: order.deliveryStop ? order.deliveryStop.city && order.deliveryStop.state ? `${order.deliveryStop.city}, ${order.deliveryStop.state}` : order.deliveryStop.address || "—" : "—"
      };
    }).sort((a, b) => {
      // Sort by pickup date
      if (!a.pickupDate && !b.pickupDate) return 0;
      if (!a.pickupDate) return 1;
      if (!b.pickupDate) return -1;
      return a.pickupDate.getTime() - b.pickupDate.getTime();
    }) || [];

    // Helper to check if previous load's delivery is complete (dark green)
    const getPreviousLoadDeliveryStatus = (currentOrder: any): boolean => {
      const currentIndex = ordersWithDates.findIndex(o => o.id === currentOrder.id);
      if (currentIndex <= 0) return true; // First load, no previous

      const previousOrder = ordersWithDates[currentIndex - 1];
      const hasPOD = previousOrder.order_files?.some((file: any) => file.file_category === "POD");
      return !!hasPOD; // Dark green if POD exists
    };

    // Find the first pickup date for this truck
    const firstPickupDate = ordersWithDates.filter(order => order.pickupDate).sort((a, b) => a.pickupDate.getTime() - b.pickupDate.getTime())[0]?.pickupDate;
    const today = new Date();
    const oneDayInFuture = addDays(today, 1);
    return days.map((day, index) => {
      // Check if this day matches the 2-week block date
      const twoWeekBlockDate = truck.twoWeekBlockDate ? new Date(truck.twoWeekBlockDate.split("T")[0] + "T00:00:00") : null;
      const isBlockDay = twoWeekBlockDate && isSameDay(day, twoWeekBlockDate);

      // Check if this day has "game over" in lost day notes
      const gameOverCheck = isGameOverDay(day);
      const isGameOver = gameOverCheck.isGameOver;
      const gameOverType = gameOverCheck.type;

      // If this is the block day or game over day, render black cell
      if (isBlockDay || isGameOver) {
        const displayText = isBlockDay ? {
          line1: "GAME",
          line2: "OVER"
        } : gameOverType === "yard" ? {
          line1: "Left truck",
          line2: "on the Yard"
        } : {
          line1: "Recovery",
          line2: "On the road"
        };
        const isToday = isSameDay(day, getChicagoToday());
        return <td key={index} className={`border-b-[6px] border-gray-400 ${index > 0 ? "border-l border-border" : ""} ${index === 4 ? "border-r border-border" : ""} p-0 w-[12%] bg-black relative`} style={{
          minWidth: "120px",
          maxWidth: "120px",
          width: "120px",
          height: "64px"
        }}>
            {/* Red border overlay for today column */}
            {isToday && <div className="absolute" style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderLeft: "6px solid #dc2626",
            borderRight: "6px solid #dc2626",
            ...(isLastTruck ? {
              borderBottom: "6px solid #dc2626"
            } : {}),
            zIndex: 100,
            pointerEvents: "none"
          }} />}

            {/* Top half */}
            <div className="border-b border-gray-400 flex flex-col items-center justify-center bg-black" style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px"
          }}>
              <div className="text-[11px] font-bold text-white leading-tight">{displayText.line1}</div>
            </div>

            {/* Bottom half */}
            <div className="flex flex-col items-center justify-center bg-black" style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px"
          }}>
              <div className="text-[11px] font-bold text-white leading-tight">{displayText.line2}</div>
            </div>
          </td>;
      }

      // Find all orders for this day and categorize them
      const dayStr = format(day, "yyyy-MM-dd");

      // Check if order has any stops on this day
      const allDayOrders = ordersWithDates.filter(order => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        return hasPickupOnDay || hasDeliveryOnDay;
      });

      // Separate same-day orders from different-day orders
      // Same-day means ALL pickups and deliveries happen on the same day
      const sameDayOrders = allDayOrders.filter(order => {
        // Check if this order has both pickups and deliveries on THIS day
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        // And check if ALL stops are on the same day (isSameDayPickupDelivery checks first stops)
        return hasPickupOnDay && hasDeliveryOnDay && isSameDayPickupDelivery(order);
      });
      const pickupOnlyOrders = allDayOrders.filter(order => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        // Has pickup on this day but not delivery on this day (or not a same-day order)
        return hasPickupOnDay && !hasDeliveryOnDay;
      });
      const deliveryOnlyOrders = allDayOrders.filter(order => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        // Has delivery on this day but not pickup on this day (or not a same-day order)
        return hasDeliveryOnDay && !hasPickupOnDay;
      });

      // Count total stops for this day (sum of all pickup/delivery stops from all orders)
      const totalPickupStops = pickupOnlyOrders.reduce((sum, order) => sum + (order.pickupStopsByDate?.get(dayStr) || 0), 0);
      const totalDeliveryStops = deliveryOnlyOrders.reduce((sum, order) => sum + (order.deliveryStopsByDate?.get(dayStr) || 0), 0);

      // Check if this day is in transit (between pickup and delivery) for any order
      const inTransitOrders = ordersWithDates.filter(order => {
        if (!order.pickupDate || !order.deliveryDate || isSameDayPickupDelivery(order)) return false;
        const dayTime = day.getTime();
        const pickupTime = order.pickupDate.getTime();
        const deliveryTime = order.deliveryDate.getTime();
        // Day is in transit if it's after pickup and before delivery
        // This includes future loads that haven't been picked up yet (2-3 day loads)
        return dayTime > pickupTime && dayTime < deliveryTime;
      });
      // Only show in-transit if there are no other orders on this day
      const isInTransit = inTransitOrders.length > 0 && allDayOrders.length === 0;

      // Check if any orders have rescheduling notes for THIS specific day
      const hasRescheduledOrders = [...inTransitOrders, ...deliveryOnlyOrders, ...pickupOnlyOrders, ...sameDayOrders].some(
        order => {
          if (!order.date_change_notes || !order.date_change_notes.includes("Supposed to deliver")) {
            return false;
          }
          // Extract the date from "Supposed to deliver on MM/DD/YYYY"
          const match = order.date_change_notes.match(/Supposed to deliver on (\d{2})\/(\d{2})\/(\d{4})/);
          if (!match) return false;
          
          const [, monthStr, dayStr, yearStr] = match;
          const supposedDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
          supposedDate.setHours(0, 0, 0, 0);
          
          // Check if this day matches the supposed delivery date
          return isSameDay(supposedDate, day);
        }
      );

      // Check if there's a game over day before this day
      const hasGameOverBefore = days.slice(0, index).some(prevDay => {
        const check = isGameOverDay(prevDay);
        return check.isGameOver;
      });

      // Check if this is a "continuing delivery" scenario
      // This happens when TODAY has deliveries and NEXT day also has deliveries (without pickups) for the same orders
      let shouldShowContinuingDelivery = false;
      if (index < days.length - 1 && deliveryOnlyOrders.length > 0) {
        const nextDayStr = format(days[index + 1], "yyyy-MM-dd");
        // Check if any of today's delivery-only orders have deliveries on the next day without pickups
        shouldShowContinuingDelivery = deliveryOnlyOrders.some(order => {
          const hasDeliveryNextDay = order.deliveryStopsByDate?.has(nextDayStr);
          const hasPickupNextDay = order.pickupStopsByDate?.has(nextDayStr);
          return hasDeliveryNextDay && !hasPickupNextDay;
        });
      }

      // Check if this is a missing pickup (red XXX) - empty pickup cell after first pickup
      // But NOT if there's a game over day before this OR if it's a continuing delivery
      // Also exclude "No pre-book?" case (exactly one day in future)
      const isEmptyPickup = pickupOnlyOrders.length === 0 && sameDayOrders.length === 0;
      const isAfterFirstPickup = firstPickupDate && day >= firstPickupDate;
      const isWithinTimeframe = day <= oneDayInFuture;
      const isOneDayFuture = isSameDay(day, oneDayInFuture);
      const isMissingPickup = isEmptyPickup && isAfterFirstPickup && isWithinTimeframe && !isInTransit && !hasGameOverBefore && !shouldShowContinuingDelivery && !isOneDayFuture;

      // Check if this day is today (Chicago time)
      const isToday = isSameDay(day, getChicagoToday());
      // Apply left border to all cells except the first
      const showLeftBorder = index > 0;
      // Apply right border to the last day (5th day, index 4)
      const showRightBorder = index === 4;
      return <td key={index} className={`border-b-[6px] border-gray-400 ${showLeftBorder ? "border-l border-border" : ""} p-0 relative`} style={{
        width: "120px",
        minWidth: "120px",
        maxWidth: "120px",
        verticalAlign: "top",
        ...(showRightBorder ? {
          borderRight: "1px solid hsl(var(--border))"
        } : {})
      }}>
          {/* Red border overlay for today column */}
          {isToday && <div className="absolute" style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderLeft: "6px solid #dc2626",
          borderRight: "6px solid #dc2626",
          ...(isLastTruck ? {
            borderBottom: "6px solid #dc2626"
          } : {}),
          zIndex: 100,
          pointerEvents: "none"
        }} />}

          <div className="flex flex-col relative" style={{
          width: "120px",
          height: "64px"
        }}>
            {/* Delivery cell (top half) - NOW includes same-day delivery stops */}
            <div className={`border-b ${!isToday && index > 0 ? "border-l" : ""} ${!isToday ? "border-r" : ""} border-gray-400 flex flex-col ${deliveryOnlyOrders.length > 0 || sameDayOrders.length > 0 ? "" : "bg-muted"} overflow-hidden`} style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px"
          }}>
              {deliveryOnlyOrders.length > 0 || sameDayOrders.length > 0 ? <div className="space-x-0.5 flex-1 p-0 overflow-hidden flex flex-row">
                  {deliveryOnlyOrders.flatMap(order => {
                // Get all delivery stops for this day
                const dayStr = format(day, "yyyy-MM-dd");
                const deliveryStopsForDay = order.deliveryStops?.filter((stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr) || [];

                // Render a separate cell for each delivery stop
                return deliveryStopsForDay.map((stop: any, stopIdx: number) => {
                  const cellColor = getDeliveryCellColor(order, stop);
                  const totalCellsOnDay = deliveryOnlyOrders.reduce((sum, o) => sum + (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr).length || 0), 0) + sameDayOrders.reduce((sum, o) => sum + (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr).length || 0), 0);
                  return <div key={`delivery-${order.id}-stop-${stop.id || stopIdx}`} className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full cursor-pointer`} style={totalCellsOnDay > 1 ? {
                    width: `${100 / totalCellsOnDay}%`
                  } : {}} onClick={() => {
                    const loadDetails = getLoadDetailsForZoom(order.id, truck);
                    if (loadDetails) setZoomedLoad(loadDetails);
                  }}>
                          <div className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}>
                            {stop.city}, {stop.state}
                          </div>
                          <div className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}>
                            {formatTimeRange(stop.datetime, stop.end_datetime)}
                          </div>
                        </div>;
                });
              })}
                  {sameDayOrders.flatMap(order => {
                // Get all delivery stops for this day
                const dayStr = format(day, "yyyy-MM-dd");
                const deliveryStopsForDay = order.deliveryStops?.filter((stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr) || [];

                // Render a separate cell for each delivery stop
                return deliveryStopsForDay.map((stop: any, stopIdx: number) => {
                  const cellColor = getDeliveryCellColor(order, stop);
                  const totalCellsOnDay = deliveryOnlyOrders.reduce((sum, o) => sum + (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr).length || 0), 0) + sameDayOrders.reduce((sum, o) => sum + (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr).length || 0), 0);
                  return <div key={`delivery-same-day-${order.id}-stop-${stop.id || stopIdx}`} className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full cursor-pointer`} style={totalCellsOnDay > 1 ? {
                    width: `${100 / totalCellsOnDay}%`
                  } : {}} onClick={() => {
                    const loadDetails = getLoadDetailsForZoom(order.id, truck);
                    if (loadDetails) setZoomedLoad(loadDetails);
                  }}>
                          <div className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}>
                            {stop.city}, {stop.state}
                          </div>
                          <div className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}>
                            {formatTimeRange(stop.datetime, stop.end_datetime)}
                          </div>
                        </div>;
                });
              })}
                </div> : (() => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const homeTimeNote = truck.lost_day_notes?.find((note: any) => note.date === dayStr && note.note_type === 'home_time');
                  const hasHomeTime = !!homeTimeNote;
                  
                  return <div 
                    className={`text-xs h-full flex items-center justify-center ${(isInTransit || shouldShowContinuingDelivery) ? hasRescheduledOrders ? "bg-orange-500 text-black font-semibold" : "text-foreground font-semibold" : "text-muted-foreground cursor-pointer"}`} 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isInTransit && !shouldShowContinuingDelivery) {
                        setHomeTimeDialog({
                          truckId: truck.id,
                          truckNumber: truck.truckNumber || truck.truck_number || 'Unknown',
                          driverId: truck.driverId,
                          date: dayStr,
                          isCurrentlyHomeTime: hasHomeTime
                        });
                      }
                    }}
                  >
                    {(() => {
                      if (hasHomeTime) {
                        return <Home className="h-4 w-4" />;
                      }
                      
                      if (isInTransit || shouldShowContinuingDelivery) {
                        return hasRescheduledOrders ? "RESCHEDULED" : ">>>";
                      }
                      
                      return "—";
                    })()}
                  </div>;
                })()}
            </div>

            {/* Pickup cell (bottom half) - includes same-day orders */}
            <div className={`${!isToday && index > 0 ? "border-l" : ""} ${!isToday ? "border-r" : ""} border-gray-400 flex flex-col ${pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? "" : isMissingPickup ? "bg-[hsl(0_72%_53%)] dark:bg-[hsl(var(--destructive-light))]" : "bg-muted"} overflow-hidden`} style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px"
          }}>
              {pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? <div className="space-x-0.5 flex-1 p-0 overflow-hidden flex flex-row" onClick={(e) => e.stopPropagation()}>
              {sameDayOrders.flatMap(order => {
                const previousComplete = getPreviousLoadDeliveryStatus(order);
                const cellColor = getPickupCellColor(order, previousComplete);

                // Get all pickup stops for this day
                const dayStr = format(day, "yyyy-MM-dd");
                const pickupStopsForDay = order.pickupStops?.filter((stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr) || [];

                // Render a separate cell for each pickup stop
                return pickupStopsForDay.map((stop: any, stopIdx: number) => {
                  const totalCellsOnDay = pickupOnlyOrders.reduce((sum, o) => sum + (o.pickupStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr).length || 0), 0) + sameDayOrders.reduce((sum, o) => sum + (o.pickupStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr).length || 0), 0);
                  return <div key={`pickup-same-day-${order.id}-stop-${stop.id || stopIdx}`} className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full cursor-pointer`} style={totalCellsOnDay > 1 ? {
                    width: `${100 / totalCellsOnDay}%`
                  } : {}} onClick={() => {
                    const loadDetails = getLoadDetailsForZoom(order.id, truck);
                    if (loadDetails) setZoomedLoad(loadDetails);
                  }}>
                          <div className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}>
                            {stop.city}, {stop.state}
                          </div>
                          <div className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}>
                            {formatTimeRange(stop.datetime, stop.end_datetime)}
                          </div>
                        </div>;
                });
              })}
                  {pickupOnlyOrders.flatMap(order => {
                const previousComplete = getPreviousLoadDeliveryStatus(order);
                const cellColor = getPickupCellColor(order, previousComplete);

                // Get all pickup stops for this day
                const dayStr = format(day, "yyyy-MM-dd");
                const pickupStopsForDay = order.pickupStops?.filter((stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr) || [];

                // Render a separate cell for each pickup stop
                return pickupStopsForDay.map((stop: any, stopIdx: number) => {
                  const totalCellsOnDay = pickupOnlyOrders.reduce((sum, o) => sum + (o.pickupStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr).length || 0), 0) + sameDayOrders.length;
                  return <div key={`pickup-${order.id}-stop-${stop.id || stopIdx}`} className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full cursor-pointer`} style={totalCellsOnDay > 1 ? {
                    width: `${100 / totalCellsOnDay}%`
                  } : {}} onClick={() => {
                    const loadDetails = getLoadDetailsForZoom(order.id, truck);
                    if (loadDetails) setZoomedLoad(loadDetails);
                  }}>
                          <div className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}>
                            {stop.city}, {stop.state}
                          </div>
                          <div className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}>
                            {formatTimeRange(stop.datetime, stop.end_datetime)}
                          </div>
                        </div>;
                });
              })}
                </div> : (() => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const homeTimeNote = truck.lost_day_notes?.find((note: any) => note.date === dateStr && note.note_type === 'home_time');
                  const hasHomeTime = !!homeTimeNote;
                  
                  return <div 
                    className={`text-xs h-full flex items-center justify-center ${isMissingPickup ? "text-white dark:text-[hsl(var(--destructive-light-foreground))] font-semibold cursor-pointer" : (isInTransit || shouldShowContinuingDelivery) ? hasRescheduledOrders ? "bg-orange-500 text-black font-semibold" : "text-foreground font-semibold" : "text-muted-foreground cursor-pointer"}`} 
                    onClick={e => {
                      e.stopPropagation();
                      
                      if (isMissingPickup) {
                        const currentNote = getLostDayNote(day);
                        const lostDayNoteData = truck.lost_day_notes?.find((note: any) => note.date === dateStr);
                        const isCurrentlyHomeTime = lostDayNoteData?.note_type === 'home_time';
                        const actualNoteValue = lostDayNoteData?.note || '';
                        
                        setRedCellDialog({
                          truckId: truck.id,
                          truckNumber: truck.truckNumber || truck.truck_number || 'Unknown',
                          driverId: truck.driverId,
                          date: dateStr,
                          currentNote: currentNote
                        });
                        // Show display text if no database value exists
                        setRedCellNote(actualNoteValue || currentNote);
                        setRedCellIsHomeTime(isCurrentlyHomeTime);
                      } else if (!isInTransit && !shouldShowContinuingDelivery) {
                        // Open home time dialog for empty cells
                        setHomeTimeDialog({
                          truckId: truck.id,
                          truckNumber: truck.truckNumber || truck.truck_number || 'Unknown',
                          driverId: truck.driverId,
                          date: dateStr,
                          isCurrentlyHomeTime: hasHomeTime
                        });
                      }
                    }}
                  >
                    {isMissingPickup ? getLostDayNote(day) : (isInTransit || shouldShowContinuingDelivery) ? hasRescheduledOrders ? "RESCHEDULED" : ">>>" : hasHomeTime ? <Home className="h-4 w-4" /> : "—"}
                  </div>;
                })()}
            </div>
          </div>
        </td>;
    });
  };

  // Filter reports by office - memoized (must be before any early returns)
  const filterReportsByOffice = useMemo(() => {
    return (office: string) => {
      if (!groupedReports) return [];
      let filtered = groupedReports.filter(group => group.office === office);

      // Apply dispatch name filter
      if (debouncedDispatchNameFilter) {
        filtered = filtered.filter(group => group.dispatcher.toLowerCase().includes(debouncedDispatchNameFilter.toLowerCase()));
      }

      // Apply truck/driver and load number filters
      if (debouncedTruckDriverFilter || debouncedLoadNumberFilter) {
        filtered = filtered.map(group => {
          const filteredTrucks = group.trucks.filter(truck => {
            // Check truck/driver filter
            if (debouncedTruckDriverFilter) {
              const matchesTruck = truck.truckNumber?.toLowerCase().includes(debouncedTruckDriverFilter.toLowerCase());
              const matchesDriver = truck.driver?.toLowerCase().includes(debouncedTruckDriverFilter.toLowerCase());
              if (!matchesTruck && !matchesDriver) return false;
            }

            // Check load number filter
            if (debouncedLoadNumberFilter) {
              const hasMatchingLoad = truck.allOrders?.some((order: any) => order.broker_load_number?.toLowerCase().includes(debouncedLoadNumberFilter.toLowerCase()));
              if (!hasMatchingLoad) return false;
            }
            return true;
          });
          return {
            ...group,
            trucks: filteredTrucks
          };
        }).filter(group => group.trucks.length > 0);
      }
      return filtered;
    };
  }, [groupedReports, debouncedTruckDriverFilter, debouncedDispatchNameFilter, debouncedLoadNumberFilter]);

  // Check delivery ETAs using edge function
  useEffect(() => {
    const checkETAs = async () => {
      console.log("🔍 Checking delivery ETAs via edge function...");
      try {
        const {
          data: {
            session
          }
        } = await supabase.auth.getSession();
        const response = await fetch('https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/check-delivery-etas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM'}`
          },
          body: JSON.stringify({})
        });
        if (!response.ok) {
          const error = await response.text();
          console.error("❌ Error checking ETAs:", error);
          return;
        }
        const data = await response.json();
        if (data?.success && data?.results) {
          console.log(`✅ Received ${data.results.length} ETA results`);

          // Store late order internal_load_numbers
          const lateOrderNumbers = data.results.filter((result: any) => result.is_late).map((result: any) => result.internal_load_number);

          // Find the order IDs from internal_load_numbers
          const lateOrderIds = new Set<string>();
          groupedReports?.forEach(group => {
            group.trucks.forEach(truck => {
              truck.allOrders?.forEach(order => {
                if (lateOrderNumbers.includes(order.internal_load_number)) {
                  lateOrderIds.add(order.id);
                }
              });
            });
          });
          setLateDeliveries(lateOrderIds);
          console.log(`🔶 Found ${lateOrderIds.size} late orders:`, Array.from(lateOrderIds));
        }
      } catch (error) {
        console.error("❌ Failed to check ETAs:", error);
      }
    };
    if (groupedReports?.length) {
      checkETAs();
      const interval = setInterval(checkETAs, 30 * 60 * 1000); // Check every 30 minutes (optimized from 5 min)
      return () => clearInterval(interval);
    }
  }, [groupedReports]);

  // Auto-switch to correct dispatcher page when filters find matches
  useEffect(() => {
    if (!groupedReports) return;

    // Check if any filter is active
    const hasActiveFilter = debouncedTruckDriverFilter || debouncedDispatchNameFilter || debouncedLoadNumberFilter;
    if (!hasActiveFilter) return;

    // Check if current tab has any matches
    const currentTabReports = filterReportsByOffice(activeTab);
    if (currentTabReports.length > 0) return; // Stay on current tab if matches exist

    // Search across all offices for matches
    for (const office of offices) {
      if (office === activeTab) continue; // Already checked current tab

      const officeReports = filterReportsByOffice(office);
      if (officeReports.length > 0) {
        // Found matches in another office, switch to it
        setActiveTab(office);
        break;
      }
    }
  }, [debouncedTruckDriverFilter, debouncedDispatchNameFilter, debouncedLoadNumberFilter, groupedReports, activeTab, filterReportsByOffice]);

  // Only get filtered reports for the active tab
  const activeOfficeReports = useMemo(() => {
    const reports = filterReportsByOffice(activeTab);

    // New drivers filter: show only trucks with no loads ever OR exactly 1 load with pickup today
    if (showNewDrivers) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return reports.map(group => {
        const newDriverTrucks = group.trucks.filter(truck => {
          // Get all non-GAME|OVER orders
          const realOrders = truck.allOrders?.filter((order: any) => order.notes !== "GAME|OVER") || [];

          // Case 1: No loads ever - brand new driver
          if (realOrders.length === 0) {
            return true;
          }

          // Case 2: Exactly 1 load with pickup today - first load starting today
          if (realOrders.length === 1) {
            const order = realOrders[0];
            if (!order.pickupStop?.datetime) return false;
            const pickupDate = new Date(order.pickupStop.datetime);
            pickupDate.setHours(0, 0, 0, 0);
            return isSameDay(pickupDate, today);
          }

          // More than 1 load = experienced driver
          return false;
        });
        return {
          ...group,
          trucks: newDriverTrucks
        };
      }).filter(group => group.trucks.length > 0);
    }
    if (!showEmptyTrucks) {
      return reports;
    }

    // Filter to show only trucks with red "Empty" cells for today
    // Must match the exact display logic for isMissingPickup
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = addDays(today, 1);
    const todayStr = format(today, "yyyy-MM-dd");
    return reports.map(group => {
      const emptyTrucks = group.trucks.filter(truck => {
        // Find the first pickup date for this truck
        const firstPickupDate = truck.allOrders?.filter((order: any) => order.pickupStop?.datetime && order.notes !== "GAME|OVER").map((order: any) => {
          const date = new Date(order.pickupStop.datetime);
          date.setHours(0, 0, 0, 0);
          return date;
        }).sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];

        // Check if today is after first pickup
        const isAfterFirstPickup = firstPickupDate && today >= firstPickupDate;
        if (!isAfterFirstPickup) {
          return false; // Only show trucks that have had at least one pickup
        }

        // Check if today is within timeframe (today or tomorrow only)
        const isWithinTimeframe = today.getTime() <= tomorrow.getTime();
        if (!isWithinTimeframe) {
          return false;
        }

        // Check if truck is in transit today
        const isInTransitToday = truck.allOrders?.some((order: any) => {
          if (order.notes === "GAME|OVER") return false;
          if (!order.pickupStop?.datetime || !order.deliveryStop?.datetime) return false;
          const pickupDate = new Date(order.pickupStop.datetime);
          pickupDate.setHours(0, 0, 0, 0);
          const deliveryDate = new Date(order.deliveryStop.datetime);
          deliveryDate.setHours(0, 0, 0, 0);

          // In transit if between pickup and delivery (exclusive)
          return today.getTime() > pickupDate.getTime() && today.getTime() < deliveryDate.getTime();
        });
        if (isInTransitToday) {
          return false; // Exclude in-transit trucks
        }

        // Check if truck has any pickup or same-day order today
        const hasPickupToday = truck.allOrders?.some((order: any) => {
          if (order.notes === "GAME|OVER") return false;
          if (!order.pickupStop?.datetime) return false;
          const pickupDate = new Date(order.pickupStop.datetime);
          pickupDate.setHours(0, 0, 0, 0);
          return isSameDay(pickupDate, today);
        });
        if (hasPickupToday) {
          return false; // Must have NO pickup today
        }

        // Check for game over before today
        const hasGameOverBefore = truck.lost_day_notes?.some((note: any) => {
          const noteDate = new Date(note.date + "T00:00:00");
          if (noteDate >= today) return false; // Only check days before today
          const noteText = note.note?.toLowerCase() || "";
          return noteText.includes("game over");
        });
        if (hasGameOverBefore) {
          return false; // Exclude if game over occurred before today
        }

        // At this point, truck would show red "Empty" cell for today
        return true;
      });
      return {
        ...group,
        trucks: emptyTrucks
      };
    }).filter(group => group.trucks.length > 0); // Only show dispatchers with empty trucks
  }, [activeTab, filterReportsByOffice, showEmptyTrucks, showNewDrivers]);
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
                <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
                <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
                {[...Array(7)].map((_, idx) => <div key={idx} className="col-span-1 h-8 bg-muted animate-pulse rounded" />)}
              </div>
            </div>)}
        </div>
      </div>;
  }
  if (error) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8 text-destructive">
          Error loading reports: {error.message}
        </div>
      </div>;
  }
  const handleNoteChange = async (truckId: string, driverId: string | null, newValue: string) => {
    try {
      await updateTruckNote.mutateAsync({
        truckId,
        driverId: driverId || undefined,
        note: newValue
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "There was an error updating the note.",
        variant: "destructive"
      });
    }
  };
  const handleGameOverClick = (truckId: string, driverName: string) => {
    // Find existing "game over" dates for this truck
    const allTrucks = Object.values(groupedReports || {}).flatMap((g: any) => g.trucks);
    const truck = allTrucks.find((t: any) => t.id === truckId);
    const existingGameOverDates = truck?.lost_day_notes?.filter((note: any) => note.note && note.note.toLowerCase().includes("game over")).map((note: any) => note.date) || [];
    console.log("🎮 Opening game over dialog for truck:", { truckId, driverName, truck, activeOrders: truck?.activeOrders });
    setGameOverDialog({
      truckId,
      truckNumber: driverName,
      existingDates: existingGameOverDates
    });
  };
  return <>
      <div className="h-full bg-background flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
          <div className="px-4 pt-2 sticky top-0 bg-background z-[101] border-b border-border">
            {/* Filters Section */}
            <div className="flex gap-2 mb-2">
              <Input placeholder="Truck # / Driver name" value={truckDriverFilter} onChange={e => setTruckDriverFilter(e.target.value)} className="max-w-[200px]" />
              <Input placeholder="Dispatch name" value={dispatchNameFilter} onChange={e => setDispatchNameFilter(e.target.value)} className="max-w-[180px]" />
              <Input placeholder="Load # (Broker load)" value={loadNumberFilter} onChange={e => setLoadNumberFilter(e.target.value)} className="max-w-[200px]" />
              {(truckDriverFilter || dispatchNameFilter || loadNumberFilter) && <Button variant="ghost" size="sm" onClick={() => {
              setTruckDriverFilter("");
              setDispatchNameFilter("");
              setLoadNumberFilter("");
            }}>
                  <X className="h-4 w-4" />
                </Button>}
              <Button variant="outline" size="sm" onClick={() => setLegendDialogOpen(true)} className="gap-2 ml-auto">
                <HelpCircle className="h-4 w-4" />
                Legend
              </Button>
            </div>
            <div className="flex items-center justify-between mb-2">
              <TabsList className="grid grid-cols-4 flex-1">
                {offices.map(office => <TabsTrigger key={office} value={office}>
                    {office}
                  </TabsTrigger>)}
              </TabsList>
              {(hasRole("supervisor") || hasRole("manager") || hasRole("admin") || hasRole("safety")) && <div className="flex gap-2 ml-4">
                  <Button variant={showEmptyTrucks ? "default" : "outline"} size="sm" onClick={() => setShowEmptyTrucks(!showEmptyTrucks)}>
                    Empty trucks
                  </Button>
                  <Button variant={showNewDrivers ? "default" : "outline"} size="sm" onClick={() => setShowNewDrivers(!showNewDrivers)} className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    New drivers
                  </Button>
                </div>}
            </div>
          </div>

          {/* Only render the active tab content */}
          <TabsContent value={activeTab} className="mt-0 flex-1 overflow-auto">
            {activeOfficeReports.length === 0 ? <div className="p-4">
                <div className="text-center py-12 text-muted-foreground">
                  No trucks assigned to dispatchers in {activeTab}
                </div>
              </div> : <div className="px-4 py-2">
                {activeOfficeReports.map(group => {
              const startDate = getCalendarStartDate(group.dispatcherId);
              const days = Array.from({
                length: 6
              }, (_, i) => addDays(startDate, i));
              return <div key={group.dispatcherId} className="bg-card">
                      {/* Google Sheets-style table */}
                      <div className="w-full">
                        <table className="w-full border-collapse bg-card border-[3px] border-gray-400" style={{
                    tableLayout: "auto"
                  }}>
                          <thead>
                            {/* Date Range Selector Row with Dispatcher Name */}
                            <tr className="bg-muted/50 sticky top-0 z-20">
                              <th colSpan={3} className="border-r border-b-[2px] border-gray-400 px-2 py-1 text-left font-bold text-foreground bg-muted/50" style={{
                          fontSize: "0.825rem"
                        }}>
                                {group.dispatcher} ({group.trucks.length} truck{group.trucks.length !== 1 ? "s" : ""})
                                {group.ext && <span className="text-xs font-normal text-muted-foreground ml-2">
                                    ext {group.ext}
                                  </span>}
                              </th>
                              <th colSpan={6} className="border-r border-b-[2px] border-gray-400 px-2 py-1 bg-muted/50">
                                <div className="flex items-center justify-center">
                                  <button onClick={() => handleCalendarDateChange(group.dispatcherId, addDays(startDate, -1))} className="p-0.5 hover:bg-muted rounded">
                                    <ChevronLeft className="h-3 w-3" />
                                  </button>
                                  <div className="text-xs font-medium text-foreground mx-2">
                                    {format(startDate, "MMM dd")} - {format(addDays(startDate, 5), "MMM dd, yyyy")}
                                  </div>
                                  <button onClick={() => handleCalendarDateChange(group.dispatcherId, addDays(startDate, 1))} className="p-0.5 hover:bg-muted rounded">
                                    <ChevronRight className="h-3 w-3" />
                                  </button>
                                </div>
                              </th>
                              <th colSpan={4} className="border-r border-b-[2px] border-gray-400 bg-muted/50" style={{
                          width: "220px",
                          minWidth: "220px",
                          maxWidth: "220px"
                        }}></th>
                              <th colSpan={2} className={`bg-muted/50 border-l border-b-[2px] border-gray-400 px-2 py-1 text-center text-[10px] font-medium text-muted-foreground ${sidebarOpen ? "border-r border-border" : ""}`}>
                                Recent Activity
                              </th>
                            </tr>
                            {/* Column Headers Row */}
                            <tr className="bg-muted/50 sticky top-[37px] z-10">
                              <th className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50 w-16">
                                Truck #
                              </th>
                              <th className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50" style={{
                          width: "163px",
                          minWidth: "163px",
                          maxWidth: "163px"
                        }}>
                                Driver
                              </th>
                              <th className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50" style={{
                          width: "136px",
                          minWidth: "136px",
                          maxWidth: "136px"
                        }}>
                                Home
                              </th>
                              {days.map((day, index) => {
                          const isToday = isSameDay(day, getChicagoToday());
                          return <th key={index} className={`border-b-[3px] border-gray-400 ${index > 0 ? "border-l border-gray-400" : ""} px-2 py-1 text-center text-[10px] font-medium text-muted-foreground bg-muted/50 relative`} style={{
                            width: "120px",
                            minWidth: "120px",
                            maxWidth: "120px",
                            ...(isToday ? {
                              position: "relative",
                              zIndex: 10
                            } : {})
                          }}>
                                    {/* Red border overlay for today header */}
                                    {isToday && <div className="absolute" style={{
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              borderLeft: "6px solid #dc2626",
                              borderRight: "6px solid #dc2626",
                              borderTop: "6px solid #dc2626",
                              borderBottom: "6px solid hsl(var(--border))",
                              zIndex: 100,
                              pointerEvents: "none"
                            }} />}
                                    <div className="relative z-10 text-[10px]">{format(day, "EEEE")}</div>
                                    <div className="text-[9px] text-muted-foreground relative z-10">
                                      {format(day, "M/d/yyyy")}
                                    </div>
                                  </th>;
                        })}
                              <th colSpan={4} className="border-t border-l border-r border-b-[3px] border-gray-400 px-2 py-0.5 text-center text-[10px] font-medium text-muted-foreground bg-muted/50" style={{
                          width: "220px",
                          minWidth: "220px",
                          maxWidth: "220px"
                        }}>
                                Away (D) | Drive | Shift | Break | Cycle
                              </th>
                              <th className="border-t border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50 w-20">
                                Last Edit
                              </th>
                              <th className={`border-t border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50 w-20 ${sidebarOpen ? "border-r border-border" : ""}`}>
                                Date
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.trucks.slice(0, visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT).map((truck, truckIndex) => {
                        const modifiedCells = renderTruckCalendarCells(truck, startDate, truckIndex, group.trucks.length);
                        const isLastTruck = truckIndex === group.trucks.length - 1;
                        const isMapExpanded = expandedTruckMap === truck.id;

                        // Get current order (earliest order without POD based on pickup datetime) - exclude GAME-OVER blocks
                        const currentOrder = truck.allOrders?.filter(order => order.notes !== "GAME|OVER" && !order.order_files?.some((file: any) => file.file_category === "POD")).sort((a, b) => {
                          // Sort by pickup datetime ascending (earliest first)
                          const aDate = new Date(a.pickup_datetime || "9999-12-31").getTime();
                          const bDate = new Date(b.pickup_datetime || "9999-12-31").getTime();
                          return aDate - bDate;
                        })[0];

                        // Extract pickup and delivery stops from pickup_drops
                        if (currentOrder && currentOrder.pickup_drops) {
                          currentOrder.pickupStop = currentOrder.pickup_drops.find((pd: any) => pd.type === "pickup");
                          currentOrder.deliveryStop = currentOrder.pickup_drops.find((pd: any) => pd.type === "delivery");
                        }
                        const hasBOL = currentOrder?.order_files?.some((file: any) => file.file_category === "BOL") || false;
                        const hasPOD = currentOrder?.order_files?.some((file: any) => file.file_category === "POD") || false;
                        const pickupArrived = !!currentOrder?.pickupStop?.arrived_at;

                        // Check if any HOS timer is 0 or below
                        const hasExpiredHOS = truck.driveMinutes <= 0 || truck.shiftMinutes <= 0 || truck.breakMinutes <= 0 || truck.cycleMinutes <= 0;

                        // Get driver cell styling (includes drug test and game over)
                        const isNew = isNewDriver(truck);
                        const canManageDrugTests = hasRole("safety") || hasRole("manager") || hasRole("admin");
                        const driverCellStyle = getDriverCellStyle(truck);
                        const shouldShowDrugTestUI = isNew && canManageDrugTests;
                        return <React.Fragment key={truck.id}>
                                    <tr className={truckIndex % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                                      <td className="border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs font-medium" style={{
                              width: "77px",
                              minWidth: "77px",
                              maxWidth: "77px",
                              ...getCompanyBackgroundColor(truck.companyName)
                            }}>
                                        <div className="flex flex-col gap-0.5">
                                          <div className="flex items-center gap-1">
                                            {truck.truckNumber}
                                            {hasExpiredHOS && <Clock className="h-3 w-3 text-destructive" />}
                                          </div>
                                          {truck.companyName && (
                                            <div className="text-[9px] opacity-60 leading-tight">
                                              {truck.companyName}
                                            </div>
                                          )}
                                            {truck.hasMultipleOrders && <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipContent>
                                                    <p className="text-[10px]">
                                                      {truck.totalOrdersCount} total orders ({truck.activeOrdersCount}{" "}
                                                      active)
                                                    </p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>}
                                          </div>
                                      </td>
                      <td className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs ${shouldShowDrugTestUI ? "cursor-pointer hover:opacity-80" : ""}`} style={{
                              width: "163px",
                              minWidth: "163px",
                              maxWidth: "163px",
                              ...driverCellStyle
                            }} onClick={e => {
                              // Only trigger drug test dialog if clicking on the cell itself, not the info button
                              if (shouldShowDrugTestUI && truck.driverId && e.target === e.currentTarget) {
                                console.log("Opening drug test dialog for:", {
                                  driverId: truck.driverId,
                                  driverName: truck.driver,
                                  truckId: truck.id,
                                  truckNumber: truck.truckNumber
                                });
                                setDrugTestDialog({
                                  driverId: truck.driverId,
                                  driverName: truck.driver,
                                  truckId: truck.id
                                });
                              }
                            }}>
                                        <div className="flex items-center gap-2" onClick={e => {
                                // Also allow clicking on the driver name text
                                if (shouldShowDrugTestUI && truck.driverId && e.target === e.currentTarget) {
                                  console.log("Opening drug test dialog for:", {
                                    driverId: truck.driverId,
                                    driverName: truck.driver,
                                    truckId: truck.id,
                                    truckNumber: truck.truckNumber
                                  });
                                  setDrugTestDialog({
                                    driverId: truck.driverId,
                                    driverName: truck.driver,
                                    truckId: truck.id
                                  });
                                }
                              }}>
                                          <span>{truck.driver}</span>
                                          {(truck.driverPhone || truck.driverEmail || truck.trailerNumber || truck.driver2Name) && <Popover>
                                              <PopoverTrigger asChild>
                                                <button className="inline-flex" onClick={e => e.stopPropagation()}>
                                                  <Info className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto">
                                                <div className="space-y-1">
                                                  {truck.driver2Name ? <>
                                                      <p className="font-semibold text-sm">
                                                        Driver 1: {truck.driver1Name}
                                                      </p>
                                                      {truck.driverPhone && <p className="text-xs">📞 {truck.driverPhone}</p>}
                                                      {truck.driverEmail && <p className="text-xs">✉️ {truck.driverEmail}</p>}
                                                      <div className="border-t pt-1 mt-1">
                                                        <p className="font-semibold text-sm">
                                                          Driver 2: {truck.driver2Name}
                                                        </p>
                                                        {truck.driver2Phone && <p className="text-xs">📞 {truck.driver2Phone}</p>}
                                                        {truck.driver2Email && <p className="text-xs">✉️ {truck.driver2Email}</p>}
                                                      </div>
                                                      <div className="border-t pt-1 mt-1">
                                                        <p className="text-xs">🚚 Truck: {truck.truckNumber}</p>
                                                        {truck.trailerNumber && <p className="text-xs">🚛 Trailer: {truck.trailerNumber}</p>}
                                                      </div>
                                                      {((truck as any).emergencyContactName || (truck as any).emergencyContactPhone) && <div className="border-t pt-1 mt-1">
                                                        <p className="font-semibold text-xs mb-0.5">Emergency Contact</p>
                                                        {(truck as any).emergencyContactName && <p className="text-xs">👤 {(truck as any).emergencyContactName}{(truck as any).emergencyContactRelation ? ` (${(truck as any).emergencyContactRelation})` : ''}</p>}
                                                        {(truck as any).emergencyContactPhone && <p className="text-xs">📞 {(truck as any).emergencyContactPhone}</p>}
                                                      </div>}
                                                    </> : <>
                                                      <p className="font-semibold text-sm">{truck.driver}</p>
                                                      <p className="text-xs">🚚 Truck: {truck.truckNumber}</p>
                                                      {truck.trailerNumber && <p className="text-xs">🚛 Trailer: {truck.trailerNumber}</p>}
                                                      {truck.driverPhone && <p className="text-xs">📞 {truck.driverPhone}</p>}
                                                      {truck.driverEmail && <p className="text-xs">✉️ {truck.driverEmail}</p>}
                                                      {((truck as any).emergencyContactName || (truck as any).emergencyContactPhone) && <div className="border-t pt-1 mt-1">
                                                        <p className="font-semibold text-xs mb-0.5">Emergency Contact</p>
                                                        {(truck as any).emergencyContactName && <p className="text-xs">👤 {(truck as any).emergencyContactName}{(truck as any).emergencyContactRelation ? ` (${(truck as any).emergencyContactRelation})` : ''}</p>}
                                                        {(truck as any).emergencyContactPhone && <p className="text-xs">📞 {(truck as any).emergencyContactPhone}</p>}
                                                      </div>}
                                                    </>}
                                                </div>
                                              </PopoverContent>
                                            </Popover>}
                                        </div>
                                      </td>
                                      <td className="border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs" style={{
                              width: "136px",
                              minWidth: "136px",
                              maxWidth: "136px"
                            }}>
                                        <div className="flex items-center gap-1" style={{
                                display: "flex",
                                alignItems: "center"
                              }}>
                                          {!truck.home || truck.home === "—" ? <TruckMapDialog truckNumber={truck.truckNumber} truckId={truck.id} pickupAddress={currentOrder?.pickupStop ? `${currentOrder.pickupStop.address || ""}, ${currentOrder.pickupStop.city || ""}, ${currentOrder.pickupStop.state || ""} ${currentOrder.pickupStop.zip_code || ""}`.trim() : undefined} deliveryAddress={currentOrder?.deliveryStop ? `${currentOrder.deliveryStop.address || ""}, ${currentOrder.deliveryStop.city || ""}, ${currentOrder.deliveryStop.state || ""} ${currentOrder.deliveryStop.zip_code || ""}`.trim() : undefined} pickupDate={truck.pickup?.date} pickupTime={truck.pickup?.time} deliveryDate={truck.delivery?.date} deliveryTime={truck.delivery?.time} loadNumber={currentOrder?.load_number} brokerLoadNumber={currentOrder?.broker_load_number} hasBOL={hasBOL} hasPOD={hasPOD} pickupArrived={pickupArrived} isOpen={isMapExpanded} onOpenChange={open => setExpandedTruckMap(open ? truck.id : null)}>
                                              <MapPin className="text-destructive cursor-pointer hover:text-destructive/80 transition-colors" style={{
                                    width: "12px",
                                    height: "12px",
                                    flexShrink: 0
                                  }} size={12} />
                                            </TruckMapDialog> : <>
                                              <TruckMapDialog truckNumber={truck.truckNumber} truckId={truck.id} pickupAddress={currentOrder?.pickupStop ? `${currentOrder.pickupStop.address || ""}, ${currentOrder.pickupStop.city || ""}, ${currentOrder.pickupStop.state || ""} ${currentOrder.pickupStop.zip_code || ""}`.trim() : undefined} deliveryAddress={currentOrder?.deliveryStop ? `${currentOrder.deliveryStop.address || ""}, ${currentOrder.deliveryStop.city || ""}, ${currentOrder.deliveryStop.state || ""} ${currentOrder.deliveryStop.zip_code || ""}`.trim() : undefined} pickupDate={truck.pickup?.date} pickupTime={truck.pickup?.time} deliveryDate={truck.delivery?.date} deliveryTime={truck.delivery?.time} loadNumber={currentOrder?.load_number} brokerLoadNumber={currentOrder?.broker_load_number} hasBOL={hasBOL} hasPOD={hasPOD} pickupArrived={pickupArrived} isOpen={isMapExpanded} onOpenChange={open => setExpandedTruckMap(open ? truck.id : null)}>
                                                <MapPin className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" style={{
                                      width: "12px",
                                      height: "12px",
                                      flexShrink: 0
                                    }} size={12} />
                                              </TruckMapDialog>
                                              <span className="text-[10px]">{truck.home}</span>
                                            </>}
                                        </div>
                                      </td>
                                      {modifiedCells}
                                      {/* Merged cell for Away, Drive, Shift, Cycle with Notes at bottom */}
                                      <td colSpan={4} className={`border-r border-b-[6px] border-gray-400 p-0 ${hasExpiredHOS ? "bg-destructive/50" : ""}`} style={{
                              height: "64px"
                            }}>
                                        <div className={`h-8 border-b border-border flex items-center justify-around px-1 ${hasExpiredHOS ? "bg-destructive/50" : ""}`}>
                                          {/* Away Days - Show distance in miles if available */}
                                          <div className="flex flex-col items-center">
                                            <div className="text-[9px] text-muted-foreground mb-0">AWAY (D)</div>
                                            {editing?.truckId === truck.id && editing?.field === "miles-away" ? (
                                              <Input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={editing.value}
                                                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") handleSave();
                                                  if (e.key === "Escape") handleCancel();
                                                }}
                                                className="w-12 h-5 text-[10px] p-1"
                                                autoFocus
                                              />
                                            ) : truck.milesAway > 0 ? (
                                              <div 
                                                className="text-[10px] text-[hsl(var(--info))] font-medium cursor-pointer hover:bg-accent/50 px-1 rounded"
                                                onClick={() => handleEdit(truck.id, "miles-away", truck.milesAway.toString())}
                                              >
                                                {truck.milesAway}
                                              </div>
                                            ) : (
                                              <div 
                                                className="text-[10px] text-foreground font-medium cursor-pointer hover:bg-accent/50 px-1 rounded"
                                                onClick={() => handleEdit(truck.id, "miles-away", truck.awayDays.toString())}
                                              >
                                                {truck.awayDays}
                                              </div>
                                            )}
                                          </div>

                                          {/* HOS Circular Timers */}
                                          <HosCircularTimer minutes={truck.driveMinutes} maxMinutes={11 * 60} // 11 hours max drive time
                                label="DRIVE" color="#84cc16" // green
                                size={31} strokeWidth={3} />
                                          <HosCircularTimer minutes={truck.shiftMinutes} maxMinutes={14 * 60} // 14 hours max shift time
                                label="SHIFT" color="#06b6d4" // cyan
                                size={31} strokeWidth={3} />
                                          <HosCircularTimer minutes={truck.breakMinutes} maxMinutes={8 * 60} // 8 hours max break time
                                label="BREAK" color="#8b5cf6" // purple
                                size={31} strokeWidth={3} />
                                          <HosCircularTimer minutes={truck.cycleMinutes} maxMinutes={70 * 60} // 70 hours max cycle time
                                label="CYCLE" color="hsl(var(--muted-foreground))" // muted foreground color
                                size={31} strokeWidth={3} />
                                        </div>
                                        <div className="h-8 p-0 w-full">
                                          <EditableNoteField truckId={truck.id} driverId={truck.driverId} value={truck.note} handleNoteChange={handleNoteChange} setNoteDialogContent={setNoteDialogContent} setNoteDialogOpen={setNoteDialogOpen} onHistoryClick={setHistoryDialogDriverId} />
                                        </div>
                                      </td>
                                      <td className={`border-b-[6px] border-gray-400 px-2 py-1 text-[10px] text-muted-foreground`} style={{
                              width: "80px",
                              minWidth: "80px",
                              maxWidth: "80px"
                            }}>
                                        {truck.lastEdit}
                                       </td>
                                       <td className={`border-b-[6px] border-gray-400 px-2 py-1 text-[10px] text-muted-foreground ${sidebarOpen ? "border-r border-border" : ""} relative`} style={{
                              width: "80px",
                              minWidth: "80px",
                              maxWidth: "80px"
                            }}>
                                        {activeTab === "Recovery" && truck.activeOrders?.some((o: any) => {
                                          const order = o as any;
                                          // Hide Revert button if POD is uploaded
                                          const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
                                          return order.is_recovery && !hasPOD;
                                        }) ? (
                                          <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-auto px-2 py-1 bg-background hover:bg-green-500/20 rounded z-[50] border border-green-500/50" onClick={async (e) => {
                                            e.stopPropagation();
                                            // Revert recovery load
                                            const recoveryOrder = truck.activeOrders.find((o: any) => {
                                              const order = o as any;
                                              const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
                                              return order.is_recovery && !hasPOD;
                                            });
                                            if (!recoveryOrder) return;
                                            
                                            try {
                                              const order = recoveryOrder as any;
                                              
                                              // Get recovery history from the table
                                              const { data: recoveryHistory, error: historyError } = await supabase
                                                .from("recovery_history")
                                                .select("*")
                                                .eq("order_id", order.id)
                                                .is("reverted_at", null)
                                                .order("created_at", { ascending: false })
                                                .limit(1)
                                                .single();

                                              if (historyError || !recoveryHistory) {
                                                toast({
                                                  title: "No recovery history found",
                                                  description: "Cannot revert this load",
                                                  variant: "destructive"
                                                });
                                                return;
                                              }
                                              
                                              // Revert the order to original assignment
                                              const { error: orderError } = await supabase
                                                .from("orders")
                                                .update({
                                                  is_recovery: false,
                                                  driver1_id: recoveryHistory.original_driver1_id,
                                                  driver2_id: recoveryHistory.original_driver2_id,
                                                  truck_id: recoveryHistory.original_truck_id,
                                                  trailer_id: recoveryHistory.original_trailer_id,
                                                  original_driver1_id: null,
                                                  original_driver2_id: null,
                                                  original_truck_id: null,
                                                  original_trailer_id: null,
                                                  original_miles: null,
                                                  original_freight_amount: null,
                                                  original_driver_price: null,
                                                  recovery_miles: null,
                                                  recovery_freight_amount: null,
                                                  recovery_driver_price: null,
                                                  recovery_date: null
                                                })
                                                .eq("id", order.id);
                                              
                                              if (orderError) throw orderError;
                                              
                                              // Update the original truck - reassign original drivers and clear recovery status
                                              const { error: truckError } = await supabase
                                                .from("trucks")
                                                .update({
                                                  driver1_id: recoveryHistory.original_driver1_id,
                                                  driver2_id: recoveryHistory.original_driver2_id,
                                                  needs_recovery: false,
                                                  left_by_driver_id: null
                                                })
                                                .eq("id", recoveryHistory.original_truck_id);

                                              if (truckError) throw truckError;

              // Reassign original dispatcher to original driver ONLY (do NOT touch recovery driver)
              if (recoveryHistory.original_driver1_id && recoveryHistory.original_dispatcher_id) {
                const { error: dispatcherError } = await supabase
                  .from("drivers")
                  .update({ dispatcher_id: recoveryHistory.original_dispatcher_id })
                  .eq("id", recoveryHistory.original_driver1_id);

                if (dispatcherError) throw dispatcherError;
              }

                                              // Mark recovery history as reverted
                                              const { data: { user } } = await supabase.auth.getUser();
                                              await supabase
                                                .from("recovery_history")
                                                .update({
                                                  reverted_at: new Date().toISOString(),
                                                  reverted_by: user?.id || null
                                                })
                                                .eq("id", recoveryHistory.id);
                                              
                                              toast({
                                                title: "Recovery reverted",
                                                description: `Load ${recoveryOrder.load_number} returned to original driver`
                                              });
                                              
                                              queryClient.invalidateQueries({ queryKey: ["reports"] });
                                            } catch (error) {
                                              toast({
                                                title: "Failed to revert",
                                                description: error instanceof Error ? error.message : "Unknown error",
                                                variant: "destructive"
                                              });
                                            }
                                          }}>
                                            <span className="text-[10px] text-green-600">Revert</span>
                                          </Button>
                                        ) : (
                                          <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-[23px] w-[23px] p-0.5 bg-background hover:bg-destructive/10 rounded-full z-[50] border border-border" onClick={(e) => {
                                            e.stopPropagation();
                                            handleGameOverClick(truck.id, truck.driver);
                                          }}>
                                            <XCircle className="h-[19px] w-[19px] text-destructive" />
                                          </Button>
                                        )}
                                        {truck.editDate}
                                      </td>
                                    </tr>
                                    {isMapExpanded && <tr key={`${truck.id}-map`}>
                                        <td colSpan={13} className="p-4 border-b-[3px] border-border">
                                          <TruckMapView truckNumber={truck.truckNumber} truckId={truck.id} pickupAddress={currentOrder?.pickupStop ? `${currentOrder.pickupStop.address || ""}, ${currentOrder.pickupStop.city || ""}, ${currentOrder.pickupStop.state || ""} ${currentOrder.pickupStop.zip_code || ""}`.trim() : undefined} deliveryAddress={currentOrder?.deliveryStop ? `${currentOrder.deliveryStop.address || ""}, ${currentOrder.deliveryStop.city || ""}, ${currentOrder.deliveryStop.state || ""} ${currentOrder.deliveryStop.zip_code || ""}`.trim() : undefined} pickupDate={truck.pickup?.date} pickupTime={truck.pickup?.time} deliveryDate={truck.delivery?.date} deliveryTime={truck.delivery?.time} loadNumber={currentOrder?.load_number} brokerLoadNumber={currentOrder?.broker_load_number} hasBOL={hasBOL} hasPOD={hasPOD} pickupArrived={pickupArrived} />
                                        </td>
                                      </tr>}
                                  </React.Fragment>;
                      })}
                          </tbody>
                        </table>

                        {/* Load More Trigger */}
                        {group.trucks.length > (visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT) && <div className="flex justify-center py-4">
                            <Button variant="outline" onClick={() => handleLoadMore(group.dispatcherId)} className="w-full max-w-md">
                              Load More Trucks (
                              {group.trucks.length - (visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT)}{" "}
                              remaining)
                            </Button>
                          </div>}
                      </div>
                    </div>;
            })}
              </div>}
          </TabsContent>
        </Tabs>
      </div>

      {/* Note Dialog */}
      <Dialog open={noteDialogOpen !== null} onOpenChange={open => !open && setNoteDialogOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Full Note</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Textarea value={noteDialogContent} onChange={e => setNoteDialogContent(e.target.value)} className="min-h-[200px] w-full" placeholder="Add note..." />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setNoteDialogOpen(null)}>
                Cancel
              </Button>
              <Button onClick={async () => {
              if (noteDialogOpen) {
                await handleNoteChange(noteDialogOpen.truckId, noteDialogOpen.driverId, noteDialogContent);
                setNoteDialogOpen(null);
              }
            }}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Game Over Dialog */}
      <SetDriverStatusDialog 
        open={gameOverDialog !== null}
        onOpenChange={(open) => !open && setGameOverDialog(null)}
        truckNumber={gameOverDialog?.truckNumber || ""}
        truckId={gameOverDialog?.truckId || ""}
        existingDates={gameOverDialog?.existingDates || []}
        onConfirm={async (startDate, type, note, recoveryDriverId) => {
          if (!gameOverDialog) return;
          
          try {
            console.log("🚀 Starting set driver status...", { startDate, type, note, recoveryDriverId });
            const dateStr = format(startDate, "yyyy-MM-dd");
            const noteText = type === "yard" ? "game over - yard" : "game over - at road";
            
            // Find the truck to get driver and active orders info
            const allTrucks = Object.values(groupedReports || {}).flatMap((g: any) => g.trucks);
            const truck = allTrucks.find((t: any) => t.id === gameOverDialog.truckId);
            console.log("📦 Found truck:", { truckId: truck?.truckId, driverId: truck?.driverId, driverName: truck?.driverName });
            
            if (!truck) {
              throw new Error("Truck not found in reports data");
            }
            
            // Create lost day note for the driver (not truck)
            if (truck?.driverId) {
              console.log("📝 Creating lost day note for driver...");
              await updateLostDayNote.mutateAsync({
                driverId: truck.driverId,
                date: dateStr,
                note: noteText
              });
              console.log("✅ Lost day note created");
            } else {
              console.warn("⚠️ No driver assigned to truck, cannot create lost day note");
            }
            
            // Update truck note
            console.log("📝 Updating truck note...");
            await updateTruckNote.mutateAsync({
              truckId: gameOverDialog.truckId,
              note: note.trim()
            });
            console.log("✅ Truck note updated");
            
            // Set recovery status on truck
            console.log("🔍 Truck data before update:", {
              truckId: gameOverDialog.truckId,
              truck: truck,
              driverId: truck?.driverId,
              driverName: truck?.driverName
            });
            
            const truckUpdate: any = {
              needs_recovery: true,
              left_by_driver_id: truck?.driverId || null,
            };
            
            // Get original dispatcher ID BEFORE we unassign it
            let originalDispatcherId = null;
            if (truck?.driverId) {
              const { data: originalDriver } = await supabase
                .from("drivers")
                .select("dispatcher_id")
                .eq("id", truck.driverId)
                .maybeSingle();
              originalDispatcherId = originalDriver?.dispatcher_id || null;
              console.log("📋 Original dispatcher ID:", originalDispatcherId);
            }
            
            // If recovery driver selected, assign to them (keep dispatcher unchanged for original driver)
            if (recoveryDriverId) {
              truckUpdate.driver1_id = recoveryDriverId;
              console.log("👤 Assigning recovery driver:", recoveryDriverId);
            } else {
              truckUpdate.driver1_id = null;
              truckUpdate.driver2_id = null;
              truckUpdate.trailer_id = null;
              console.log("🚫 Unassigning driver and trailer");
            }
            
            console.log("🚛 EXACT truck update object:", JSON.stringify(truckUpdate, null, 2));
            console.log("🚛 Truck ID for update:", gameOverDialog.truckId);
            const { error: truckError } = await supabase
              .from("trucks")
              .update(truckUpdate)
              .eq("id", gameOverDialog.truckId);
              
            if (truckError) {
              console.error("❌ Truck update failed:", truckError);
              throw truckError;
            }
            console.log("✅ Truck status updated");
            
            // Mark active orders as recovery loads
            if (truck?.activeOrders && truck.activeOrders.length > 0) {
              console.log("📦 Updating active orders:", truck.activeOrders.length);
              const activeOrderIds = truck.activeOrders.map((o: any) => o.id);
              
              const orderUpdate: any = {
                is_recovery: true,
                original_driver1_id: truck.driverId,
                original_driver2_id: truck.driver2Id || null,
                original_truck_id: gameOverDialog.truckId,
                original_trailer_id: truck.trailerId || null
              };
              
              // If recovery driver selected, assign them to the loads
              if (recoveryDriverId) {
                console.log("🔍 Fetching recovery driver's truck assignment...");
                // Fetch the recovery driver's current truck assignment
                const { data: recoveryTrucks, error: recoveryTruckError } = await supabase
                  .from("trucks")
                  .select("id, truck_number")
                  .eq("driver1_id", recoveryDriverId)
                  .limit(1);
                
                if (recoveryTruckError) {
                  console.error("❌ Failed to fetch recovery driver's truck:", recoveryTruckError);
                  // Continue without updating truck_id if we can't fetch it
                }
                
                orderUpdate.driver1_id = recoveryDriverId;
                
                // If recovery driver has a truck, assign the load to that truck too
                if (recoveryTrucks && recoveryTrucks.length > 0) {
                  orderUpdate.truck_id = recoveryTrucks[0].id;
                  console.log("✅ Recovery driver has truck:", recoveryTrucks[0].truck_number);
                } else {
                  console.log("⚠️ Recovery driver has no assigned truck, keeping original truck");
                }
                
                // Save recovery history for each order
                for (const orderId of activeOrderIds) {
                  const { error: historyError } = await supabase
                    .from("recovery_history")
                    .insert({
                      order_id: orderId,
                      original_driver1_id: truck.driverId,
                      original_driver2_id: truck.driver2Id || null,
                      original_truck_id: gameOverDialog.truckId,
                      original_trailer_id: truck.trailerId || null,
                      original_dispatcher_id: originalDispatcherId,
                      recovery_driver1_id: recoveryDriverId,
                      recovery_driver2_id: null,
                      recovery_truck_id: recoveryTrucks && recoveryTrucks.length > 0 ? recoveryTrucks[0].id : null,
                      recovery_trailer_id: null
                    });
                  
                  if (historyError) {
                    console.error("❌ Failed to save recovery history:", historyError);
                  }
                }
              } else {
                // No recovery driver selected - unassign driver but keep truck
                orderUpdate.driver1_id = null;
                console.log("🚫 Unassigning driver from orders (no recovery driver selected)");
              }
              
              console.log("📦 Order update data:", orderUpdate);
              const { error: orderError } = await supabase
                .from("orders")
                .update(orderUpdate)
                .in("id", activeOrderIds);
                
              if (orderError) {
                console.error("❌ Order update failed:", orderError);
                throw orderError;
              }
              console.log("✅ Orders updated successfully");
            } else {
              console.log("ℹ️ No active orders to update");
            }
            
            console.log("🎉 Set driver status completed successfully");
            toast({
              title: "Truck sent to recovery",
              description: recoveryDriverId 
                ? `Truck ${gameOverDialog.truckNumber} assigned to recovery driver${truck?.activeOrders?.length > 0 ? ` with ${truck.activeOrders.length} active load(s)` : ""}`
                : `Truck ${gameOverDialog.truckNumber} marked for recovery${truck?.activeOrders?.length > 0 ? ` with ${truck.activeOrders.length} active load(s)` : ""} - awaiting driver assignment`
            });
            setGameOverDialog(null);
          } catch (error) {
            console.error("❌ Set driver status failed:", error);
            toast({
              title: "Failed to set status",
              description: error instanceof Error ? error.message : "Unknown error occurred",
              variant: "destructive"
            });
          }
        }}
        onRemoveAll={async () => {
          if (!gameOverDialog || gameOverDialog.existingDates.length === 0) {
            toast({
              title: "No game over dates",
              description: "This truck has no game over dates to remove.",
              variant: "destructive"
            });
            return;
          }
          try {
            // Find the truck to get driver ID
            const allTrucks = Object.values(groupedReports || {}).flatMap((g: any) => g.trucks);
            const truck = allTrucks.find((t: any) => t.id === gameOverDialog.truckId);
            
            console.log("🔍 Remove All - Finding truck:", {
              searchingForTruckId: gameOverDialog.truckId,
              foundTruck: truck,
              driverId: truck?.driverId
            });
            
            if (!truck?.driverId) {
              throw new Error("No driver found for this truck");
            }
            
            for (const date of gameOverDialog.existingDates) {
              await deleteLostDayNote.mutateAsync({
                driverId: truck.driverId,
                date
              });
            }
            toast({
              title: "Game over removed",
              description: `Removed game over for ${gameOverDialog.existingDates.length} day(s) on truck ${gameOverDialog.truckNumber}`
            });
            setGameOverDialog(null);
          } catch (error) {
            toast({
              title: "Error",
              description: error instanceof Error ? error.message : "Failed to remove game over",
              variant: "destructive"
            });
          }
        }}
      />

      {/* Drug Test Dialog */}
      <Dialog open={!!drugTestDialog} onOpenChange={open => !open && setDrugTestDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drug Test Result - {drugTestDialog?.driverName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Test Result</label>
              <Select value={getDrugTestForDriver(drugTestDialog?.driverId || "")?.result || "pending"} onValueChange={value => {
              if (drugTestDialog?.driverId && drugTestDialog?.truckId) {
                console.log("Updating drug test:", {
                  driverId: drugTestDialog.driverId,
                  driverName: drugTestDialog.driverName,
                  truckId: drugTestDialog.truckId,
                  result: value
                });
                upsertDrugTest.mutate({
                  driverId: drugTestDialog.driverId,
                  result: value as "positive" | "negative" | "pending",
                  truckId: drugTestDialog.truckId
                });
              }
            }}>
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
          </div>
        </DialogContent>
      </Dialog>

      <TruckNoteHistoryDialog driverId={historyDialogDriverId} open={!!historyDialogDriverId} onOpenChange={open => !open && setHistoryDialogDriverId(null)} />

      {/* Load Zoom Dialog */}
      <Dialog open={!!zoomedLoad} onOpenChange={open => !open && setZoomedLoad(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="text-lg font-semibold">
                  Load #{zoomedLoad?.loadNumber} • Broker #{zoomedLoad?.brokerLoadNumber}
                </div>
                <div className="text-sm text-muted-foreground font-normal">
                  Truck {zoomedLoad?.truckNumber} • {zoomedLoad?.driverNames}
                </div>
              </div>
              <Button variant="outline" onClick={() => {
              if (zoomedLoad?.orderId) {
                // Mark that we're coming from reports
                localStorage.setItem('returnToReports', 'true');
                localStorage.removeItem('returnToOrders');
                navigate(`/edit-order/${zoomedLoad.orderId}`);
                setZoomedLoad(null);
              }
            }} className="shrink-0">
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Order
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {/* Pickup Stops Column */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                PICKUP STOPS
              </h3>
              {zoomedLoad?.allPickupStops && zoomedLoad.allPickupStops.length > 0 ? <div className="space-y-3">
                  {zoomedLoad.allPickupStops.map((stop: any, idx: number) => {
                const order = {
                  order_files: zoomedLoad.documents.map((cat: string) => ({
                    file_category: cat
                  })),
                  id: zoomedLoad.orderId
                };
                const previousComplete = idx > 0 && zoomedLoad.allPickupStops[idx - 1].arrived_at;

                // Determine card color based on status
                let cardBgClass = "bg-muted";
                if (stop.arrived_at) {
                  cardBgClass = "bg-blue-500/20 border-blue-500/50";
                } else if (zoomedLoad.documents.includes("POD")) {
                  cardBgClass = "bg-green-500/20 border-green-500/50";
                } else if (zoomedLoad.documents.includes("BOL")) {
                  cardBgClass = "bg-lime-500/20 border-lime-500/50";
                }
                return <div key={stop.id || idx} className={`p-4 rounded-lg border-2 shadow-sm ${cardBgClass}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-sm text-muted-foreground font-medium">
                            Stop #{idx + 1}
                          </div>
                          {stop.arrived_at && <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm font-semibold">
                              <Check className="h-4 w-4" />
                              Arrived
                            </div>}
                        </div>
                        
                        <div className="space-y-2">
                          <div className="text-base font-semibold">
                            {stop.address}
                          </div>
                          <div className="text-base">
                            {stop.city}, {stop.state} {stop.zip_code}
                          </div>
                          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                            <Clock className="h-4 w-4" />
                            {formatDateTime(stop.datetime, "MM/dd/yyyy")} {formatTimeRange(stop.datetime, stop.end_datetime)}
                          </div>
                          {stop.arrived_at && <div className="text-sm text-green-600 dark:text-green-400">
                              Arrived: {formatDateTime(stop.arrived_at, "MM/dd/yyyy, HH:mm")}
                            </div>}
                        </div>

                        {stop.id && !stop.arrived_at && <div className="flex flex-col gap-2 mt-3">
                            {shouldShowGoingToPickup(order, stop) && <Button variant="outline" onClick={() => {
                      markGoingToPickup.mutate({
                        pickupDropId: stop.id
                      });
                      toast({
                        title: "Going to Pickup"
                      });
                    }} className="w-full">
                                Going to Pickup
                              </Button>}
                            
                            {shouldShowAtPickup(order, stop) && <Button onClick={() => {
                      setArrivalTimeDialog({
                        pickupDropId: stop.id,
                        type: "pickup"
                      });
                    }} className="w-full">
                                Arrived at Pickup
                              </Button>}
                          </div>}
                      </div>;
              })}
                </div> : <div className="text-muted-foreground text-sm p-4 bg-muted rounded-lg">
                  No pickup stops
                </div>}
            </div>

            {/* Delivery Stops Column */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                DELIVERY STOPS
              </h3>
              {zoomedLoad?.allDeliveryStops && zoomedLoad.allDeliveryStops.length > 0 ? <div className="space-y-3">
                  {zoomedLoad.allDeliveryStops.map((stop: any, idx: number) => {
                const order = {
                  order_files: zoomedLoad.documents.map((cat: string) => ({
                    file_category: cat
                  })),
                  id: zoomedLoad.orderId
                };

                // Determine card color based on status
                let cardBgClass = "bg-muted";
                if (stop.arrived_at) {
                  cardBgClass = "bg-blue-500/20 border-blue-500/50";
                } else if (zoomedLoad.documents.includes("POD")) {
                  cardBgClass = "bg-green-500/20 border-green-500/50";
                } else if (zoomedLoad.documents.includes("BOL")) {
                  cardBgClass = "bg-lime-500/20 border-lime-500/50";
                }

                // Check if delivery is late
                const deliveryTime = new Date(stop.datetime);
                const now = new Date();
                const isLate = !stop.arrived_at && !zoomedLoad.documents.includes("POD") && deliveryTime < now;
                if (isLate) {
                  cardBgClass = "bg-red-500/20 border-red-500/50";
                }
                return <div key={stop.id || idx} className={`p-4 rounded-lg border-2 shadow-sm ${cardBgClass}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-sm text-muted-foreground font-medium">
                            Stop #{idx + 1}
                          </div>
                          <div className="flex items-center gap-2">
                            {isLate && <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm font-semibold">
                                <AlertCircle className="h-4 w-4" />
                                Late
                              </div>}
                            {stop.arrived_at && <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm font-semibold">
                                <Check className="h-4 w-4" />
                                Arrived
                              </div>}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="text-base font-semibold">
                            {stop.address}
                          </div>
                          <div className="text-base">
                            {stop.city}, {stop.state} {stop.zip_code}
                          </div>
                          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                            <Clock className="h-4 w-4" />
                            {formatDateTime(stop.datetime, "MM/dd/yyyy")} {formatTimeRange(stop.datetime, stop.end_datetime)}
                          </div>
                          {stop.arrived_at && <div className="text-sm text-green-600 dark:text-green-400">
                              Arrived: {formatDateTime(stop.arrived_at, "MM/dd/yyyy, HH:mm")}
                            </div>}
                        </div>

                        {stop.id && !stop.arrived_at && <div className="flex flex-col gap-2 mt-3">
                            {shouldShowGoingToDelivery(order, stop) && <Button variant="outline" onClick={() => {
                      markGoingToDelivery.mutate({
                        pickupDropId: stop.id
                      });
                      toast({
                        title: "Going to Delivery"
                      });
                    }} className="w-full">
                                Going to Delivery
                              </Button>}
                            
                            {shouldShowAtDelivery(order, stop) && <Button onClick={() => {
                      setArrivalTimeDialog({
                        pickupDropId: stop.id,
                        type: "delivery"
                      });
                    }} className="w-full">
                                Arrived at Delivery
                              </Button>}
                          </div>}
                      </div>;
              })}
                </div> : <div className="text-muted-foreground text-sm p-4 bg-muted rounded-lg">
                  No delivery stops
                </div>}
            </div>
          </div>

          {/* Bottom Section - Documents and Notes */}
          <div className="mt-6 space-y-4 pt-4 border-t">
            <div>
              <h4 className="text-sm font-semibold mb-3">Document Status</h4>
              <div className="flex gap-3 flex-wrap items-center">
                {["RC", "BOL", "POD"].map(doc => {
                  const isChecked = zoomedLoad?.documents.includes(doc);
                  return (
                    <div 
                      key={doc} 
                      onClick={() => handleDocumentClick(doc, isChecked)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                        isChecked 
                          ? "bg-[hsl(var(--cell-delivered))] text-[hsl(var(--cell-delivered-foreground))] border-[hsl(var(--cell-delivered))]" 
                          : "bg-card text-muted-foreground border-border cursor-pointer hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isChecked ? <Check className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                        <span>{doc}</span>
                      </div>
                    </div>
                  );
                })}
                
                {/* Cancel Button - centered right */}
                <div className="ml-auto">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setCancelDialogOpen(true);
                    }}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Cancel Load
                  </Button>
                </div>
              </div>
            </div>

            {zoomedLoad?.notes && zoomedLoad.notes !== "—" && <div>
                <h4 className="text-sm font-semibold mb-2">Load Notes</h4>
                <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                  {zoomedLoad.notes}
                </div>
              </div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Legend Dialog */}
      <Dialog open={legendDialogOpen} onOpenChange={setLegendDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Board Legend</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Company Colors Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Company Colors (Truck #)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-8 rounded border" style={{
                  backgroundColor: "hsl(var(--company-beverly-freight))",
                  color: "hsl(var(--company-beverly-freight-foreground))"
                }} />
                  <span className="text-sm">Beverly Freight Inc</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-8 rounded border" style={{
                  backgroundColor: "hsl(var(--company-bf-prime))",
                  color: "hsl(var(--company-bf-prime-foreground))"
                }} />
                  <span className="text-sm">BF Prime LLC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-8 rounded border" style={{
                  backgroundColor: "hsl(var(--company-beverly-group))",
                  color: "hsl(var(--company-beverly-group-foreground))"
                }} />
                  <span className="text-sm">Beverly Group LLC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-8 rounded border" style={{
                  backgroundColor: "hsl(var(--company-bf-prime-united))",
                  color: "hsl(var(--company-bf-prime-united-foreground))"
                }} />
                  <span className="text-sm">BF Prime United LLC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-8 rounded border" style={{
                  backgroundColor: "hsl(var(--company-bg-prime))",
                  color: "hsl(var(--company-bg-prime-foreground))"
                }} />
                  <span className="text-sm">BG Prime Inc</span>
                </div>
              </div>
            </div>

            {/* Calendar Cell Colors Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Calendar Cell Status Colors</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-green-600 text-white rounded flex items-center justify-center text-xs font-medium">Complete</div>
                  <span className="text-sm">Load delivered with POD uploaded</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-lime-100 text-lime-800 border border-lime-300 rounded flex items-center justify-center text-xs font-medium">Active</div>
                  <span className="text-sm">Load picked up with BOL (in transit)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-cyan-100 text-cyan-800 border border-cyan-300 rounded flex items-center justify-center text-xs font-medium">Booked</div>
                  <span className="text-sm">Load confirmed with Rate Confirmation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-gray-100 text-gray-800 border border-gray-200 rounded flex items-center justify-center text-xs font-medium">Pending</div>
                  <span className="text-sm">Load scheduled, previous not completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-blue-500/20 border border-blue-500/50 rounded flex items-center justify-center text-xs font-medium">Arrived</div>
                  <span className="text-sm">Driver marked as arrived at location</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-orange-500/20 border border-orange-500/50 rounded flex items-center justify-center text-xs font-medium">Late</div>
                  <span className="text-sm">Delivery is past due date</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-orange-500 rounded flex items-center justify-center text-xs font-medium text-black">RESCHEDULED</div>
                  <span className="text-sm">Load rescheduled or in transit</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-muted rounded flex items-center justify-center text-xs font-medium">Empty</div>
                  <span className="text-sm">No loads scheduled for this day</span>
                </div>
              </div>
            </div>

            {/* Special Indicators Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Special Indicators</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold">XXX</div>
                  <span className="text-sm">Missing pickup (truck should have a load but doesn't)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-black text-white px-3 py-1 rounded text-xs font-bold">Game Over</div>
                  <span className="text-sm">Truck is in yard or at road (marked as unavailable)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-destructive" />
                  <span className="text-sm">HOS (Hours of Service) expired or critical</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="border-4 border-red-600 w-20 h-8 rounded"></div>
                  <span className="text-sm">Today's column (red border highlight)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Home className="h-5 w-5" />
                  <span className="text-sm">Home time (click on empty "—" cells to mark/unmark)</span>
                </div>
              </div>
            </div>

            {/* Features Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Interactive Features</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Driver Info Button:</strong> Click the info icon next to driver name to view contact details, truck/trailer info</span>
                </div>
                <div className="flex items-start gap-2">
                  <Maximize2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Load Zoom:</strong> Click the zoom icon on load cells to view detailed load information with all stops</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Truck Location:</strong> Click map icon to view truck's current location on map</span>
                </div>
                <div className="flex items-start gap-2">
                  <Edit3 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Editable Notes:</strong> Click pencil icon to edit truck notes</span>
                </div>
                <div className="flex items-start gap-2">
                  <History className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Note History:</strong> View complete history of truck note changes</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold">🎯</span>
                  <span><strong>Drug Test (New Drivers):</strong> Click on driver cell for new drivers to record drug test results</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold">📅</span>
                  <span><strong>Calendar Navigation:</strong> Use arrows to navigate through different date ranges</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold">🔍</span>
                  <span><strong>Filters:</strong> Search by truck/driver name, dispatcher, or load number</span>
                </div>
              </div>
            </div>

            {/* HOS Timers Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">HOS (Hours of Service) Timers</h3>
              <div className="text-sm space-y-1">
                <p><strong>Away (D):</strong> Miles away from next pickup/delivery</p>
                <p><strong>Drive:</strong> Remaining drive time (11 hours max)</p>
                <p><strong>Shift:</strong> Remaining shift time (14 hours max)</p>
                <p><strong>Break:</strong> Time until required 30-minute break</p>
                <p><strong>Cycle:</strong> Remaining hours in 70-hour/8-day cycle</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Arrival Time Dialog */}
      <ArrivalTimeDialog
        open={!!arrivalTimeDialog}
        onOpenChange={(open) => {
          if (!open) setArrivalTimeDialog(null);
        }}
        onConfirm={(arrivalTime) => {
          if (arrivalTimeDialog) {
            updatePickupDropArrival.mutate({
              pickupDropId: arrivalTimeDialog.pickupDropId,
              arrivalTime: arrivalTime
            });
            toast({
              title: `Marked as arrived at ${arrivalTimeDialog.type}`
            });
          }
        }}
        title={arrivalTimeDialog?.type === "pickup" ? "Arrival at Pickup" : "Arrival at Delivery"}
      />

      {/* Home Time Dialog */}
      <Dialog open={!!homeTimeDialog} onOpenChange={(open) => {
        if (!open) setHomeTimeDialog(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {homeTimeDialog?.isCurrentlyHomeTime ? "Remove Home Time" : "Mark as Home Time"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Truck: <span className="font-semibold text-foreground">{homeTimeDialog?.truckNumber}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Date: <span className="font-semibold text-foreground">{homeTimeDialog?.date ? formatDateTime(homeTimeDialog.date, "EEEE, MMMM d, yyyy") : ""}</span>
              </p>
            </div>
            <p className="text-sm">
              {homeTimeDialog?.isCurrentlyHomeTime 
                ? "Do you want to remove the home time marker for this date?" 
                : "Do you want to mark this date as home time?"}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setHomeTimeDialog(null)}>
                Cancel
              </Button>
              <Button onClick={() => {
                if (homeTimeDialog) {
                  updateLostDayNote.mutate({
                    driverId: homeTimeDialog.driverId,
                    date: homeTimeDialog.date,
                    note: homeTimeDialog.isCurrentlyHomeTime ? '' : 'Home Time',
                    noteType: homeTimeDialog.isCurrentlyHomeTime ? null : 'home_time'
                  });
                  toast({
                    title: homeTimeDialog.isCurrentlyHomeTime ? "Home time removed" : "Home time marked",
                    description: `${homeTimeDialog.truckNumber} - ${formatDateTime(homeTimeDialog.date, "MM/dd/yyyy")}`
                  });
                  setHomeTimeDialog(null);
                }
              }}>
                {homeTimeDialog?.isCurrentlyHomeTime ? "Remove" : "Mark as Home Time"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Red Cell Edit Dialog */}
      <EditLostDayNoteDialog
        open={!!redCellDialog}
        onOpenChange={(open) => {
          if (!open) {
            setRedCellDialog(null);
            setRedCellNote("");
            setRedCellIsHomeTime(false);
          }
        }}
        truckNumber={redCellDialog?.truckNumber || ""}
        date={redCellDialog?.date || ""}
        currentNote={redCellNote}
        onSave={(note, isHomeTime) => {
          if (redCellDialog) {
            const mutationData = {
              driverId: redCellDialog.driverId,
              date: redCellDialog.date,
              note: isHomeTime ? 'Home Time' : note,
              noteType: isHomeTime ? 'home_time' : null
            };
            
            updateLostDayNote.mutate(mutationData, {
              onSuccess: () => {
                toast({
                  title: "Note updated",
                  description: `${redCellDialog.truckNumber} - ${formatDateTime(redCellDialog.date, "MM/dd/yyyy")}`
                });
              },
              onError: (error) => {
                toast({
                  title: "Error updating note",
                  description: error instanceof Error ? error.message : "Unknown error",
                  variant: "destructive"
                });
              }
            });
            
            setRedCellDialog(null);
            setRedCellNote("");
            setRedCellIsHomeTime(false);
          }
        }}
      />

      {/* Cancel Load Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Load #{zoomedLoad?.loadNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-tonu">Company TONU ($)</Label>
              <Input
                id="cancel-tonu"
                type="number"
                step="0.01"
                defaultValue={cancelFormData.tonu}
                onChange={(e) => cancelFormData.tonu = e.target.value}
                placeholder="Enter company TONU amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancel-driver-rate">Driver Rate ($)</Label>
              <Input
                id="cancel-driver-rate"
                type="number"
                step="0.01"
                defaultValue={cancelFormData.driverRate}
                onChange={(e) => cancelFormData.driverRate = e.target.value}
                placeholder="Enter driver rate"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancel-dh-miles">DH Miles</Label>
              <Input
                id="cancel-dh-miles"
                type="number"
                defaultValue={cancelFormData.dhMiles}
                onChange={(e) => cancelFormData.dhMiles = e.target.value}
                placeholder="Enter DH miles"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancel-notes">Notes (required)</Label>
              <Textarea
                id="cancel-notes"
                defaultValue={cancelFormData.notes}
                onChange={(e) => cancelFormData.notes = e.target.value}
                placeholder="Enter reason for cancellation"
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleCancelOrder}>
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload {uploadDocType}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging 
                  ? "border-primary bg-primary/10" 
                  : "border-border bg-muted/50"
              }`}
            >
              {uploadFiles.length > 0 ? (
                <div className="space-y-2">
                  <Check className="h-12 w-12 mx-auto text-green-500" />
                  <p className="font-medium">{uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} selected</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {uploadFiles.map((file, idx) => (
                      <p key={idx} className="text-sm text-muted-foreground">
                        {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUploadFiles([])}
                  >
                    Choose Different Files
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="font-medium mb-1">
                      Drag and drop your files here
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      or click to browse (multiple files allowed)
                    </p>
                    <Input
                      type="file"
                      onChange={handleFileSelect}
                      className="cursor-pointer"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      multiple
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setUploadDialogOpen(false);
                  setUploadFiles([]);
                }}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUploadDocument}
                disabled={uploadFiles.length === 0 || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "OK"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>;
};
export default Reports;