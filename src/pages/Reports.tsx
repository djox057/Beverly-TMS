import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MapPin,
  AlertCircle,
  Loader2,
  Edit3,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  Clock,
  Maximize2,
  XCircle,
  UserPlus,
  History,
} from "lucide-react";
import { TruckNoteHistoryDialog } from "@/components/TruckNoteHistoryDialog";
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
  field: "pickup-location" | "pickup-datetime" | "delivery-location" | "delivery-datetime" | "note";
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
const getStatusBadge = (status: string) => {
  switch (status) {
    case "In Transit":
      return (
        <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-transit))] text-[hsl(var(--cell-transit-foreground))] border border-border">
          In Transit
        </span>
      );
    case "Loading":
      return (
        <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-loading))] text-[hsl(var(--cell-loading-foreground))] border border-border">
          Loading
        </span>
      );
    case "Available":
      return (
        <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-available))] text-[hsl(var(--cell-available-foreground))] border border-border">
          Available
        </span>
      );
    case "Maintenance":
      return (
        <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-maintenance))] text-[hsl(var(--cell-maintenance-foreground))] border border-border">
          Maintenance
        </span>
      );
    default:
      return (
        <span className="px-1 py-0.5 text-[10px] bg-muted text-muted-foreground border border-border">{status}</span>
      );
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
const formatDocuments = (documents: Array<{ category: string }>) => {
  const categoryOrder = ["RC", "BOL", "POD", "ADDITIONAL"];
  const foundCategories = new Set<string>();
  const orderedDocs: string[] = [];

  categoryOrder.forEach((category) => {
    const doc = documents.find((d) => d.category === category && !foundCategories.has(d.category));
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
  value,
  handleNoteChange,
  setNoteDialogContent,
  setNoteDialogOpen,
  onHistoryClick,
}: {
  truckId: string;
  value: string;
  handleNoteChange: (truckId: string, value: string) => Promise<void>;
  setNoteDialogContent: (value: string) => void;
  setNoteDialogOpen: (truckId: string | null) => void;
  onHistoryClick: (truckId: string) => void;
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
        await handleNoteChange(truckId, localValue);
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditing(false);
  };

  return (
    <div className="relative w-full h-full group">
      {isEditing ? (
        <Textarea
          value={localValue || ""}
          onChange={(e) => setLocalValue(e.target.value)}
          autoFocus
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setLocalValue(value); // Reset to original value
              setIsEditing(false);
            }
          }}
          className={`text-[0.624rem] font-bold border-none rounded-none resize-none text-left ${hasContent ? "bg-purple-500/20" : "bg-transparent"} focus:outline-none focus:ring-0 focus:border-transparent p-1 w-full leading-tight`}
          style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px",
            boxShadow: "none",
            lineHeight: "14px",
          }}
          placeholder="Add note..."
          spellCheck={false}
        />
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className={`text-[0.624rem] font-bold cursor-text ${hasContent ? "bg-purple-500/20" : "bg-transparent"} p-1 w-full h-full overflow-hidden leading-tight line-clamp-2 ${isSaving ? "opacity-70" : ""}`}
          style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px",
            lineHeight: "14px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
          title={localValue || ""}
        >
          {hasContent ? localValue : <span className="text-muted-foreground">Add note...</span>}
        </div>
      )}
      {hasContent && !isEditing && (
        <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <History
            className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onHistoryClick(truckId);
            }}
          />
          <Maximize2
            className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground"
            onClick={() => {
              setNoteDialogContent(localValue || "");
              setNoteDialogOpen(truckId);
            }}
          />
        </div>
      )}
    </div>
  );
};

const Reports = () => {
  const { profile, hasRole } = useAuthContext();
  const navigate = useNavigate();
  const [showEmptyTrucks, setShowEmptyTrucks] = useState(false);
  const [showNewDrivers, setShowNewDrivers] = useState(false);
  const [drugTestDialog, setDrugTestDialog] = useState<{
    driverId: string;
    driverName: string;
    truckId: string;
  } | null>(null);
  const { drugTests, upsertDrugTest, getDrugTestForDriver } = useDriverDrugTests();

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

  // Helper to get drug test cell styling
  const getDrugTestCellStyle = useCallback(
    (truck: any) => {
      if (!truck.driverId) return {};

      const drugTest = getDrugTestForDriver(truck.driverId);
      const isNew = isNewDriver(truck);

      console.log("getDrugTestCellStyle:", {
        truckNumber: truck.truckNumber,
        driverId: truck.driverId,
        driverName: truck.driver,
        isNew,
        drugTestResult: drugTest?.result,
        drugTestDriverId: drugTest?.driver_id,
      });

      if (!isNew) return {};

      if (drugTest?.result === "positive") {
        return { backgroundColor: "hsl(0, 72%, 53%)", color: "white" };
      } else if (drugTest?.result === "negative") {
        return { backgroundColor: "hsl(142, 76%, 36%)", color: "white" };
      }

      return {};
    },
    [getDrugTestForDriver, isNewDriver],
  );

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

  // Offices list
  const offices = ["Čačak", "KRAGUJEVAC", "BEOGRAD"];

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
    updateTruckNote,
    updatePickupDrop,
    updateLostDayNote,
    updatePickupDropArrival,
    markGoingToPickup,
    markGoingToDelivery,
  } = useReports();
  const { data: samsaraLocations, isLoading: isLoadingSamsara } = useSamsaraLocations();
  const queryClient = useQueryClient();

  // Delete lost day note mutation
  const deleteLostDayNote = useMutation({
    mutationFn: async ({ truckId, date }: { truckId: string; date: string }) => {
      const { error } = await supabase.from("lost_day_notes").delete().eq("truck_id", truckId).eq("date", date);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [calendarDates, setCalendarDates] = useState<DispatcherCalendarState>({});
  const [expandedTruckMap, setExpandedTruckMap] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(getInitialTab());
  const [visibleTrucks, setVisibleTrucks] = useState<{ [dispatcherId: string]: number }>({});
  const [noteDialogOpen, setNoteDialogOpen] = useState<string | null>(null);
  const [noteDialogContent, setNoteDialogContent] = useState<string>("");
  const [historyDialogTruckId, setHistoryDialogTruckId] = useState<string | null>(null);
  const [truckMapView, setTruckMapView] = useState<{ truckNumber: string; latitude: number; longitude: number } | null>(
    null,
  );
  const [gameOverDialog, setGameOverDialog] = useState<GameOverDialogState | null>(null);
  const [gameOverStartDate, setGameOverStartDate] = useState<Date | undefined>(undefined);
  const [gameOverType, setGameOverType] = useState<GameOverType>("yard");
  const [lateDeliveries, setLateDeliveries] = useState<Set<string>>(new Set());
  const [truckDriverFilter, setTruckDriverFilter] = useState("");
  const [dispatchNameFilter, setDispatchNameFilter] = useState("");
  const [loadNumberFilter, setLoadNumberFilter] = useState("");

  // Helper function to check if 5 seconds have passed since button click
  const has5SecondsPassed = (timestamp: string | null | undefined): boolean => {
    if (!timestamp) return false;
    const clickTime = new Date(timestamp).getTime();
    const now = new Date().getTime();
    return (now - clickTime) >= 5000;
  };

  // Helper to determine if we should show Going to Pickup button
  const shouldShowGoingToPickup = (order: any, stop: any): boolean => {
    const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToPickupClicked = !!stop.going_to_at;
    
    // Show if no BOL and Going to Pickup hasn't been clicked for this stop
    return !hasBOL && !goingToPickupClicked;
  };

  // Helper to determine if we should show At Pickup button
  const shouldShowAtPickup = (order: any, stop: any): boolean => {
    if (stop.arrived_at) return false; // Already arrived
    
    const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToPickupClicked = !!stop.going_to_at;
    const fiveSecondsPassed = has5SecondsPassed(stop.going_to_at);
    
    // Show if (has POD from previous OR Going to Pickup clicked) AND 5 seconds have passed
    return (hasPOD || (goingToPickupClicked && fiveSecondsPassed)) && !hasBOL;
  };

  // Helper to determine if we should show Going to Delivery button
  const shouldShowGoingToDelivery = (order: any, stop: any): boolean => {
    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToDeliveryClicked = !!stop.going_to_at;
    
    // Show if no BOL and Going to Delivery hasn't been clicked for this stop
    return !hasBOL && !goingToDeliveryClicked;
  };

  // Helper to determine if we should show At Delivery button  
  const shouldShowAtDelivery = (order: any, stop: any): boolean => {
    if (stop.arrived_at) return false; // Already arrived
    
    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToDeliveryClicked = !!stop.going_to_at;
    const fiveSecondsPassed = has5SecondsPassed(stop.going_to_at);
    
    // Show if (has BOL OR Going to Delivery clicked) AND 5 seconds have passed
    return (hasBOL || (goingToDeliveryClicked && fiveSecondsPassed));
  };

  // Debounce filter values to prevent lag
  const debouncedTruckDriverFilter = useDebounce(truckDriverFilter, 300);
  const debouncedDispatchNameFilter = useDebounce(dispatchNameFilter, 300);
  const debouncedLoadNumberFilter = useDebounce(loadNumberFilter, 300);

  // Force re-render every 5 seconds to update button visibility based on 5-second delays
  useEffect(() => {
    const interval = setInterval(() => {
      // Invalidate to trigger button visibility updates for the 5-second transition
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    }, 5000);
    
    return () => clearInterval(interval);
  }, [queryClient]);

  const { toast } = useToast();
  const { open: sidebarOpen } = useSidebar();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const INITIAL_TRUCK_COUNT = 12;
  const LOAD_MORE_COUNT = 6;

  // Initialize visible trucks count when data loads
  useEffect(() => {
    if (groupedReports) {
      const initialCounts: { [key: string]: number } = {};
      groupedReports.forEach((group) => {
        initialCounts[group.dispatcherId] = INITIAL_TRUCK_COUNT;
      });
      setVisibleTrucks(initialCounts);
    }
  }, [groupedReports]);

  // Setup intersection observer for lazy loading
  const handleLoadMore = useCallback((dispatcherId: string) => {
    setVisibleTrucks((prev) => ({
      ...prev,
      [dispatcherId]: (prev[dispatcherId] || INITIAL_TRUCK_COUNT) + LOAD_MORE_COUNT,
    }));
  }, []);

  // Miles away are now calculated by a background job every 10 minutes

  const handleEdit = (
    truckId: string,
    field: "pickup-location" | "pickup-datetime" | "delivery-location" | "delivery-datetime" | "note",
    currentValue: string,
  ) => {
    setEditing({
      truckId,
      field,
      value: currentValue,
    });
  };
  const handleSave = async () => {
    if (!editing) return;
    try {
      // Find the truck to get orderId and pickup/delivery stop IDs
      const allTrucks = Object.values(groupedReports || {}).flatMap((group) => group.trucks);
      const truck = allTrucks.find((t) => t.id === editing.truckId);
      if (editing.field === "note") {
        await updateTruckNote.mutateAsync({
          truckId: truck.id,
          note: editing.value,
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
            datetime: updates.datetime,
          }),
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
            datetime: updates.datetime,
          }),
        });
      }
      toast({
        title: "Updated successfully",
        description: `${editing.field.replace("-", " ")} has been updated.`,
      });
      setEditing(null);
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the field.",
        variant: "destructive",
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
    setCalendarDates((prev) => ({
      ...prev,
      [dispatcherId]: newDate,
    }));
  };
  const getStatusColors = (status: string) => {
    switch (status) {
      case "In Transit":
        return {
          bg: "bg-[hsl(var(--cell-transit))]",
          text: "text-[hsl(var(--cell-transit-foreground))]",
          border: "border-border",
        };
      case "Loading":
        return {
          bg: "bg-[hsl(var(--cell-loading))]",
          text: "text-[hsl(var(--cell-loading-foreground))]",
          border: "border-border",
        };
      case "Available":
        return {
          bg: "bg-[hsl(var(--cell-available))]",
          text: "text-[hsl(var(--cell-available-foreground))]",
          border: "border-border",
        };
      case "Maintenance":
        return {
          bg: "bg-[hsl(var(--cell-maintenance))]",
          text: "text-[hsl(var(--cell-maintenance-foreground))]",
          border: "border-border",
        };
      default:
        return {
          bg: "bg-muted",
          text: "text-muted-foreground",
          border: "border-border",
        };
    }
  };
  const renderTruckCalendarCells = (truck: any, startDate: Date, truckIndex: number, totalTrucks: number) => {
    const isFirstTruck = truckIndex === 0;
    const isLastTruck = truckIndex === totalTrucks - 1;
    const days = Array.from(
      {
        length: 6,
      },
      (_, i) => addDays(startDate, i),
    );
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
      const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
      const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
      const hasArrived = order.pickupStop?.arrived_at;
      if (hasBOL || hasPOD)
        return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
      if (hasArrived) return "bg-[hsl(var(--cell-active))] text-[hsl(var(--cell-active-foreground))] border-border";
      if (previousLoadDeliveryComplete) return "bg-[#00FFFF] text-black border-border";
      return "bg-[hsl(var(--cell-pending))] text-[hsl(var(--cell-pending-foreground))] border-border";
    };

    // Helper to get delivery cell color based on status
    const getDeliveryCellColor = (order: any, stop?: any) => {
      const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
      const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
      const hasArrived = stop?.arrived_at || order.deliveryStop?.arrived_at;
      const isLate = lateDeliveries.has(order.id);

      if (hasPOD) return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";

      // Check if ETA is late BEFORE checking other BOL statuses
      if (isLate) return "bg-[hsl(var(--cell-late))] text-[hsl(var(--cell-late-foreground))] border-border";

      if (hasBOL && hasArrived)
        return "bg-[hsl(var(--cell-active))] text-[hsl(var(--cell-active-foreground))] border-border";
      if (hasBOL) return "bg-[hsl(var(--cell-lime))] text-[hsl(var(--cell-lime-foreground))] border-border";

      return "bg-[hsl(var(--cell-pending))] text-[hsl(var(--cell-pending-foreground))] border-border";
    };

    // Helper function to get lost day note for a specific date
    const getLostDayNote = (date: Date): string => {
      const dateStr = format(date, "yyyy-MM-dd");
      const lostDayNote = truck.lostDayNotes?.find((note: any) => note.date === dateStr);

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
      return lostDayNote.note;
    };

    // Helper function to check if a date has "game over" note (any type)
    const isGameOverDay = (date: Date): { isGameOver: boolean; type: GameOverType | null } => {
      const dateStr = format(date, "yyyy-MM-dd");
      const lostDayNote = truck.lostDayNotes?.find((note: any) => note.date === dateStr);
      const note = lostDayNote?.note?.toLowerCase();
      if (note === "game over - yard") return { isGameOver: true, type: "yard" };
      if (note === "game over - at road") return { isGameOver: true, type: "at_road" };
      return { isGameOver: false, type: null };
    };

    // Helper function to check if pickup and delivery are on the same date
    const isSameDayPickupDelivery = (order: any) => {
      return order.pickupDate && order.deliveryDate && isSameDay(order.pickupDate, order.deliveryDate);
    };

    // Get all orders with their pickup/delivery dates sorted chronologically
    const ordersWithDates =
      truck.allOrders
        ?.map((order: any) => {
          // Parse datetime without timezone conversion
          const pickupDate = order.pickup_datetime
            ? (() => {
                const parsed = parseSimpleDateTime(order.pickup_datetime);
                return new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
              })()
            : null;
          const deliveryDate = order.delivery_datetime
            ? (() => {
                const parsed = parseSimpleDateTime(order.delivery_datetime);
                return new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
              })()
            : null;

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
            pickupLocation: order.pickupStop
              ? order.pickupStop.city && order.pickupStop.state
                ? `${order.pickupStop.city}, ${order.pickupStop.state}`
                : order.pickupStop.address || "—"
              : "—",
            deliveryLocation: order.deliveryStop
              ? order.deliveryStop.city && order.deliveryStop.state
                ? `${order.deliveryStop.city}, ${order.deliveryStop.state}`
                : order.deliveryStop.address || "—"
              : "—",
          };
        })
        .sort((a, b) => {
          // Sort by pickup date
          if (!a.pickupDate && !b.pickupDate) return 0;
          if (!a.pickupDate) return 1;
          if (!b.pickupDate) return -1;
          return a.pickupDate.getTime() - b.pickupDate.getTime();
        }) || [];

    // Helper to check if previous load's delivery is complete (dark green)
    const getPreviousLoadDeliveryStatus = (currentOrder: any): boolean => {
      const currentIndex = ordersWithDates.findIndex((o) => o.id === currentOrder.id);
      if (currentIndex <= 0) return true; // First load, no previous

      const previousOrder = ordersWithDates[currentIndex - 1];
      const hasPOD = previousOrder.order_files?.some((file: any) => file.file_category === "POD");
      return !!hasPOD; // Dark green if POD exists
    };

    // Find the first pickup date for this truck
    const firstPickupDate = ordersWithDates
      .filter((order) => order.pickupDate)
      .sort((a, b) => a.pickupDate.getTime() - b.pickupDate.getTime())[0]?.pickupDate;
    const today = new Date();
    const oneDayInFuture = addDays(today, 1);
    return days.map((day, index) => {
      // Check if this day matches the 2-week block date
      const twoWeekBlockDate = truck.twoWeekBlockDate
        ? new Date(truck.twoWeekBlockDate.split("T")[0] + "T00:00:00")
        : null;

      const isBlockDay = twoWeekBlockDate && isSameDay(day, twoWeekBlockDate);

      // Check if this day has "game over" in lost day notes
      const gameOverCheck = isGameOverDay(day);
      const isGameOver = gameOverCheck.isGameOver;
      const gameOverType = gameOverCheck.type;

      // If this is the block day or game over day, render black cell
      if (isBlockDay || isGameOver) {
        const displayText = isBlockDay
          ? { line1: "GAME", line2: "OVER" }
          : gameOverType === "yard"
            ? { line1: "Left truck", line2: "on the Yard" }
            : { line1: "Recovery", line2: "On the road" };

        const isToday = isSameDay(day, getChicagoToday());

        return (
          <td
            key={index}
            className={`border-b-[6px] border-gray-400 ${index > 0 ? "border-l border-border" : ""} ${index === 4 ? "border-r border-border" : ""} p-0 w-[12%] bg-black relative`}
            style={{
              minWidth: "120px",
              maxWidth: "120px",
              width: "120px",
              height: "64px",
            }}
          >
            {/* Red border overlay for today column */}
            {isToday && (
              <div
                className="absolute pointer-events-none"
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderLeft: "6px solid #dc2626",
                  borderRight: "6px solid #dc2626",
                  ...(isLastTruck ? { borderBottom: "6px solid #dc2626" } : {}),
                  zIndex: 100,
                }}
              />
            )}

            {/* Top half */}
            <div
              className="border-b border-gray-400 flex flex-col items-center justify-center bg-black"
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              <div className="text-[11px] font-bold text-white leading-tight">{displayText.line1}</div>
            </div>

            {/* Bottom half */}
            <div
              className="flex flex-col items-center justify-center bg-black"
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              <div className="text-[11px] font-bold text-white leading-tight">{displayText.line2}</div>
            </div>
          </td>
        );
      }

      // Find all orders for this day and categorize them
      const dayStr = format(day, "yyyy-MM-dd");

      // Check if order has any stops on this day
      const allDayOrders = ordersWithDates.filter((order) => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        return hasPickupOnDay || hasDeliveryOnDay;
      });

      // Separate same-day orders from different-day orders
      // Same-day means ALL pickups and deliveries happen on the same day
      const sameDayOrders = allDayOrders.filter((order) => {
        // Check if this order has both pickups and deliveries on THIS day
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        // And check if ALL stops are on the same day (isSameDayPickupDelivery checks first stops)
        return hasPickupOnDay && hasDeliveryOnDay && isSameDayPickupDelivery(order);
      });

      const pickupOnlyOrders = allDayOrders.filter((order) => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        // Has pickup on this day but not delivery on this day (or not a same-day order)
        return hasPickupOnDay && !hasDeliveryOnDay;
      });

      const deliveryOnlyOrders = allDayOrders.filter((order) => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        // Has delivery on this day but not pickup on this day (or not a same-day order)
        return hasDeliveryOnDay && !hasPickupOnDay;
      });

      // Count total stops for this day (sum of all pickup/delivery stops from all orders)
      const totalPickupStops = pickupOnlyOrders.reduce(
        (sum, order) => sum + (order.pickupStopsByDate?.get(dayStr) || 0),
        0,
      );
      const totalDeliveryStops = deliveryOnlyOrders.reduce(
        (sum, order) => sum + (order.deliveryStopsByDate?.get(dayStr) || 0),
        0,
      );

      // Check if this day is in transit (between pickup and delivery) for any order
      const inTransitOrders = ordersWithDates.filter((order) => {
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

      // Check if there's a game over day before this day
      const hasGameOverBefore = days.slice(0, index).some((prevDay) => {
        const check = isGameOverDay(prevDay);
        return check.isGameOver;
      });

      // Check if this is a missing pickup (red XXX) - empty pickup cell after first pickup
      // But NOT if there's a game over day before this
      const isEmptyPickup = pickupOnlyOrders.length === 0 && sameDayOrders.length === 0;
      const isAfterFirstPickup = firstPickupDate && day >= firstPickupDate;
      const isWithinTimeframe = day <= oneDayInFuture;
      const isMissingPickup =
        isEmptyPickup && isAfterFirstPickup && isWithinTimeframe && !isInTransit && !hasGameOverBefore;

      // Check if this day is today (Chicago time)
      const isToday = isSameDay(day, getChicagoToday());
      // Apply left border to all cells except the first
      const showLeftBorder = index > 0;
      // Apply right border to the last day (5th day, index 4)
      const showRightBorder = index === 4;
      return (
        <td
          key={index}
          className={`border-b-[6px] border-gray-400 ${showLeftBorder ? "border-l border-border" : ""} p-0 relative`}
          style={{
            width: "120px",
            minWidth: "120px",
            maxWidth: "120px",
            verticalAlign: "top",
            ...(showRightBorder
              ? {
                  borderRight: "1px solid hsl(var(--border))",
                }
              : {}),
          }}
        >
          {/* Red border overlay for today column */}
          {isToday && (
            <div
              className="absolute pointer-events-none"
              style={{
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderLeft: "6px solid #dc2626",
                borderRight: "6px solid #dc2626",
                ...(isLastTruck ? { borderBottom: "6px solid #dc2626" } : {}),
                zIndex: 100,
              }}
            />
          )}

          <div
            className="flex flex-col relative"
            style={{
              width: "120px",
              height: "64px",
            }}
          >
            {/* Delivery cell (top half) - empty for same-day orders */}
            <div
              className={`border-b ${!isToday && index > 0 ? "border-l" : ""} ${!isToday ? "border-r" : ""} border-gray-400 flex flex-col ${deliveryOnlyOrders.length > 0 ? "" : "bg-muted"} overflow-x-auto`}
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              {deliveryOnlyOrders.length > 0 ? (
                <div className="space-x-0.5 flex-1 p-0 overflow-hidden flex flex-row">
                  {deliveryOnlyOrders.flatMap((order) => {
                    // Get all delivery stops for this day
                    const dayStr = format(day, "yyyy-MM-dd");
                    const deliveryStopsForDay =
                      order.deliveryStops?.filter(
                        (stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr,
                      ) || [];

                    // Render a separate cell for each delivery stop
                    return deliveryStopsForDay.map((stop: any, stopIdx: number) => {
                      const cellColor = getDeliveryCellColor(order, stop);
                      const totalCellsOnDay = deliveryOnlyOrders.reduce(
                        (sum, o) =>
                          sum +
                          (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr)
                            .length || 0),
                        0,
                      );

                      return (
                        <div
                          key={`delivery-${order.id}-stop-${stop.id || stopIdx}`}
                          className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full`}
                          style={totalCellsOnDay > 1 ? { width: `${100 / totalCellsOnDay}%` } : {}}
                        >
                          <div
                            className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                          >
                            {stop.city}, {stop.state}
                          </div>
                          <div
                            className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                          >
                            {formatTime(stop.datetime)}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`absolute top-[6%] ${isToday ? "right-[7%]" : "right-[1.5%]"} h-2.5 w-2.5 p-0 hover:bg-background/20`}
                              >
                                <Info className="h-2 w-2" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 z-[102]">
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold">Load Information</h4>
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <p className="font-semibold">• Load #: {order.loadDetails.loadNumber}</p>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2"
                                        onClick={() => navigate(`/edit-order/${order.id}`)}
                                      >
                                        <Edit3 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <p className="ml-4">
                                      • <strong>Broker Load #:</strong> {order.loadDetails.brokerLoadNumber}
                                    </p>
                                    <p className="ml-4 font-semibold">• Delivery Stop:</p>
                                    <p className="ml-8">
                                      - {stop.address}, {stop.city}, {stop.state} {stop.zip_code} at{" "}
                                      {formatDateTime(stop.datetime, "MM/dd, HH:mm")}
                                    </p>
                                    {stop.arrived_at && (
                                      <p className="ml-8 text-green-600 dark:text-green-400 font-medium text-xs">
                                        ✓ Arrived: {formatDateTime(stop.arrived_at, "MM/dd, HH:mm")}
                                      </p>
                                    )}
                                    <p className="ml-4">
                                      • <strong>Documents:</strong> {formatDocuments(order.loadDetails.documents)}
                                    </p>
                                    {order.loadDetails.notes !== "—" && (
                                      <p className="ml-4 text-sm font-bold">
                                        • <strong>Notes:</strong> {order.loadDetails.notes}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {stop.id && !stop.arrived_at && (
                                  <div className="space-y-2 mt-2">
                                    {/* Going to Delivery button */}
                                    {shouldShowGoingToDelivery(order, stop) && (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          markGoingToDelivery.mutate({ pickupDropId: stop.id });
                                          toast({ title: "Going to Delivery" });
                                        }}
                                        className="w-full"
                                        variant="outline"
                                      >
                                        Going to Delivery
                                      </Button>
                                    )}
                                    
                                    {/* At Delivery button - shows after 5 seconds or when BOL exists */}
                                    {shouldShowAtDelivery(order, stop) && (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          updatePickupDropArrival.mutate({
                                            pickupDropId: stop.id,
                                          });
                                          toast({
                                            title: "Marked as arrived at delivery",
                                          });
                                        }}
                                        className="w-full"
                                      >
                                        Arrived at Delivery
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      );
                    });
                  })}
                </div>
              ) : (
                <div
                  className={`text-xs h-full flex items-center justify-center ${isInTransit ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                >
                  {isInTransit ? ">>>" : "—"}
                </div>
              )}
            </div>

            {/* Pickup cell (bottom half) - includes same-day orders */}
            <div
              className={`${!isToday && index > 0 ? "border-l" : ""} ${!isToday ? "border-r" : ""} border-gray-400 flex flex-col ${pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? "" : isMissingPickup ? "bg-[hsl(0_72%_53%)] dark:bg-[hsl(var(--destructive-light))]" : "bg-muted"} overflow-x-auto`}
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              {pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? (
                <div className="space-x-0.5 flex-1 p-0 overflow-hidden flex flex-row">
                  {pickupOnlyOrders.flatMap((order) => {
                    const previousComplete = getPreviousLoadDeliveryStatus(order);
                    const cellColor = getPickupCellColor(order, previousComplete);

                    // Get all pickup stops for this day
                    const dayStr = format(day, "yyyy-MM-dd");
                    const pickupStopsForDay =
                      order.pickupStops?.filter(
                        (stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr,
                      ) || [];

                    // Render a separate cell for each pickup stop
                    return pickupStopsForDay.map((stop: any, stopIdx: number) => {
                      const totalCellsOnDay =
                        pickupOnlyOrders.reduce(
                          (sum, o) =>
                            sum +
                            (o.pickupStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr)
                              .length || 0),
                          0,
                        ) + sameDayOrders.length;

                      return (
                        <div
                          key={`pickup-${order.id}-stop-${stop.id || stopIdx}`}
                          className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full`}
                          style={totalCellsOnDay > 1 ? { width: `${100 / totalCellsOnDay}%` } : {}}
                        >
                          <div
                            className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                          >
                            {stop.city}, {stop.state}
                          </div>
                          <div
                            className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                          >
                            {formatTime(stop.datetime)}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`absolute top-[7%] ${isToday ? "right-[7%]" : "right-[1.5%]"} h-2.5 w-2.5 p-0 hover:bg-background/20`}
                              >
                                <Info className="h-2 w-2" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 z-[102]">
                              <div className="space-y-2 text-sm">
                                <h4 className="font-semibold">Load Information</h4>
                                <div className="space-y-3">
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <p className="font-semibold">• Load #: {order.loadDetails.loadNumber}</p>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2"
                                        onClick={() => navigate(`/edit-order/${order.id}`)}
                                      >
                                        <Edit3 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <p className="ml-4">
                                      • <strong>Broker Load #:</strong> {order.loadDetails.brokerLoadNumber}
                                    </p>
                                    <p className="ml-4 font-semibold">• Pickup Stop:</p>
                                    <p className="ml-8">
                                      - {stop.address}, {stop.city}, {stop.state} {stop.zip_code} at{" "}
                                      {formatDateTime(stop.datetime, "MM/dd, HH:mm")}
                                    </p>
                                    {stop.arrived_at && (
                                      <p className="ml-8 text-green-600 dark:text-green-400 font-medium text-xs">
                                        ✓ Arrived: {formatDateTime(stop.arrived_at, "MM/dd, HH:mm")}
                                      </p>
                                    )}
                                    <p className="ml-4">
                                      • <strong>Documents:</strong> {formatDocuments(order.loadDetails.documents)}
                                    </p>
                                    {order.loadDetails.notes !== "—" && (
                                      <p className="ml-4 text-sm font-bold">
                                        • <strong>Notes:</strong> {order.loadDetails.notes}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {stop.id && !stop.arrived_at && (
                                  <div className="space-y-2 mt-2">
                                    {/* Going to Pickup button */}
                                    {shouldShowGoingToPickup(order, stop) && (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          markGoingToPickup.mutate({ pickupDropId: stop.id });
                                          toast({ title: "Going to Pickup" });
                                        }}
                                        className="w-full"
                                        variant="outline"
                                      >
                                        Going to Pickup
                                      </Button>
                                    )}
                                    
                                    {/* At Pickup button - shows after 5 seconds or when previous POD exists */}
                                    {shouldShowAtPickup(order, stop) && (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          updatePickupDropArrival.mutate({ pickupDropId: stop.id });
                                          toast({ title: "Marked as arrived at pickup" });
                                        }}
                                        className="w-full"
                                      >
                                        Arrived at Pickup
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      );
                    });
                  })}
                  {sameDayOrders.map((order, idx) => {
                    const previousComplete = getPreviousLoadDeliveryStatus(order);
                    const cellColor = getPickupCellColor(order, previousComplete);

                    // Get counts for same-day stops
                    const dayStr = format(day, "yyyy-MM-dd");
                    const totalPickupStops = order.pickupStopsByDate?.get(dayStr) || 1;
                    const totalDeliveryStops = order.deliveryStopsByDate?.get(dayStr) || 1;
                    const totalCellsOnDay =
                      pickupOnlyOrders.reduce(
                        (sum, o) =>
                          sum +
                          (o.pickupStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr)
                            .length || 0),
                        0,
                      ) + sameDayOrders.length;

                    return (
                      <div
                        key={`same-day-${order.id}-${idx}`}
                        className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full`}
                        style={totalCellsOnDay > 1 ? { width: `${100 / totalCellsOnDay}%` } : {}}
                      >
                        <div
                          className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                        >
                          P: {order.pickupLocation}
                          {totalPickupStops > 1 ? ` (${totalPickupStops})` : ""}
                        </div>
                        <div
                          className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                        >
                          D: {order.deliveryLocation}
                          {totalDeliveryStops > 1 ? ` (${totalDeliveryStops})` : ""}
                        </div>
                        <div
                          className={`${totalCellsOnDay > 1 ? "text-[6px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                        >
                          {order.pickup_datetime ? formatTime(order.pickup_datetime) : "—"} /{" "}
                          {order.delivery_datetime ? formatTime(order.delivery_datetime) : "—"}
                        </div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`absolute top-[7%] ${isToday ? "right-[7%]" : "right-[1.5%]"} h-2.5 w-2.5 p-0 hover:bg-background/20`}
                            >
                              <Info className="h-2 w-2" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 z-[102]">
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">Same-Day Load Information</h4>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2"
                                  onClick={() => navigate(`/edit-order/${order.id}`)}
                                >
                                  <Edit3 className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="space-y-1">
                                <p>
                                  • <strong>Load #:</strong> {order.loadDetails.loadNumber}
                                </p>
                                <p>
                                  • <strong>Broker Load #:</strong> {order.loadDetails.brokerLoadNumber}
                                </p>
                                {order.loadDetails.allPickupStops && order.loadDetails.allPickupStops.length > 0 && (
                                  <>
                                    <p className="font-semibold">
                                      • Pickups ({order.loadDetails.allPickupStops.length}):
                                    </p>
                                    {order.loadDetails.allPickupStops.map((pickup, pIdx) => (
                                      <div key={`pickup-${pIdx}`}>
                                        <p className="ml-4">
                                          - {pickup.address}, {pickup.city}, {pickup.state} {pickup.zipCode} at{" "}
                                          {formatDateTime(pickup.datetime, "MM/dd, HH:mm")}
                                        </p>
                                        {pickup.arrived_at && (
                                          <p className="ml-6 text-green-600 dark:text-green-400 font-medium text-xs">
                                            ✓ Arrived: {formatDateTime(pickup.arrived_at, "MM/dd, HH:mm")}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </>
                                )}
                                {order.loadDetails.allDeliveryStops &&
                                  order.loadDetails.allDeliveryStops.length > 0 && (
                                    <>
                                      <p className="font-semibold">
                                        • Deliveries ({order.loadDetails.allDeliveryStops.length}):
                                      </p>
                                      {order.loadDetails.allDeliveryStops.map((delivery, dIdx) => (
                                        <div key={`delivery-${dIdx}`}>
                                          <p className="ml-4">
                                            - {delivery.address}, {delivery.city}, {delivery.state} {delivery.zipCode}{" "}
                                            at {formatDateTime(delivery.datetime, "MM/dd, HH:mm")}
                                          </p>
                                          {delivery.arrived_at && (
                                            <p className="ml-6 text-green-600 dark:text-green-400 font-medium text-xs">
                                              ✓ Arrived: {formatDateTime(delivery.arrived_at, "MM/dd, HH:mm")}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </>
                                  )}
                                <p>
                                  • <strong>Documents:</strong> {formatDocuments(order.loadDetails.documents)}
                                </p>
                                {order.loadDetails.notes !== "—" && (
                                  <p className="text-sm font-bold">
                                    • <strong>Notes:</strong> {order.loadDetails.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={`text-xs h-full flex items-center justify-center ${isMissingPickup ? "text-white dark:text-[hsl(var(--destructive-light-foreground))] font-semibold cursor-pointer hover:bg-[hsl(0_72%_63%)] dark:hover:bg-[hsl(var(--destructive))] transition-colors" : isInTransit ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                  onClick={
                    isMissingPickup
                      ? (e) => {
                          e.stopPropagation();
                          const dateStr = format(day, "yyyy-MM-dd");
                          const currentNote = getLostDayNote(day);
                          const newNote = prompt("Edit lost day note:", currentNote);
                          if (newNote !== null && newNote !== currentNote) {
                            updateLostDayNote.mutate({
                              truckId: truck.id,
                              date: dateStr,
                              note: newNote,
                            });
                          }
                        }
                      : undefined
                  }
                >
                  {isMissingPickup ? getLostDayNote(day) : isInTransit ? ">>>" : "—"}
                </div>
              )}
            </div>
          </div>
        </td>
      );
    });
  };

  // Filter reports by office - memoized (must be before any early returns)
  const filterReportsByOffice = useMemo(() => {
    return (office: string) => {
      if (!groupedReports) return [];
      let filtered = groupedReports.filter((group) => group.office === office);

      // Apply dispatch name filter
      if (debouncedDispatchNameFilter) {
        filtered = filtered.filter((group) =>
          group.dispatcher.toLowerCase().includes(debouncedDispatchNameFilter.toLowerCase()),
        );
      }

      // Apply truck/driver and load number filters
      if (debouncedTruckDriverFilter || debouncedLoadNumberFilter) {
        filtered = filtered
          .map((group) => {
            const filteredTrucks = group.trucks.filter((truck) => {
              // Check truck/driver filter
              if (debouncedTruckDriverFilter) {
                const matchesTruck = truck.truckNumber
                  ?.toLowerCase()
                  .includes(debouncedTruckDriverFilter.toLowerCase());
                const matchesDriver = truck.driver?.toLowerCase().includes(debouncedTruckDriverFilter.toLowerCase());
                if (!matchesTruck && !matchesDriver) return false;
              }

              // Check load number filter
              if (debouncedLoadNumberFilter) {
                const hasMatchingLoad = truck.allOrders?.some((order: any) =>
                  order.broker_load_number?.toLowerCase().includes(debouncedLoadNumberFilter.toLowerCase()),
                );
                if (!hasMatchingLoad) return false;
              }

              return true;
            });

            return {
              ...group,
              trucks: filteredTrucks,
            };
          })
          .filter((group) => group.trucks.length > 0);
      }

      return filtered;
    };
  }, [groupedReports, debouncedTruckDriverFilter, debouncedDispatchNameFilter, debouncedLoadNumberFilter]);

  // Check delivery ETAs using edge function
  useEffect(() => {
    const checkETAs = async () => {
      console.log("🔍 Checking delivery ETAs via edge function...");

      try {
        const { data, error } = await supabase.functions.invoke("check-delivery-etas");

        if (error) {
          console.error("❌ Error checking ETAs:", error);
          return;
        }

        if (data?.success && data?.results) {
          console.log(`✅ Received ${data.results.length} ETA results`);

          // Store late order internal_load_numbers
          const lateOrderNumbers = data.results
            .filter((result: any) => result.is_late)
            .map((result: any) => result.internal_load_number);

          // Find the order IDs from internal_load_numbers
          const lateOrderIds = new Set<string>();
          groupedReports?.forEach((group) => {
            group.trucks.forEach((truck) => {
              truck.allOrders?.forEach((order) => {
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
      const interval = setInterval(checkETAs, 5 * 60 * 1000); // Check every 5 minutes
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
  }, [
    debouncedTruckDriverFilter,
    debouncedDispatchNameFilter,
    debouncedLoadNumberFilter,
    groupedReports,
    activeTab,
    filterReportsByOffice,
  ]);

  // Only get filtered reports for the active tab
  const activeOfficeReports = useMemo(() => {
    const reports = filterReportsByOffice(activeTab);

    // New drivers filter: show only trucks with no loads ever OR exactly 1 load with pickup today
    if (showNewDrivers) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return reports
        .map((group) => {
          const newDriverTrucks = group.trucks.filter((truck) => {
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
            trucks: newDriverTrucks,
          };
        })
        .filter((group) => group.trucks.length > 0);
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

    return reports
      .map((group) => {
        const emptyTrucks = group.trucks.filter((truck) => {
          // Find the first pickup date for this truck
          const firstPickupDate = truck.allOrders
            ?.filter((order: any) => order.pickupStop?.datetime && order.notes !== "GAME|OVER")
            .map((order: any) => {
              const date = new Date(order.pickupStop.datetime);
              date.setHours(0, 0, 0, 0);
              return date;
            })
            .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];

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
          const hasGameOverBefore = truck.lostDayNotes?.some((note: any) => {
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
          trucks: emptyTrucks,
        };
      })
      .filter((group) => group.trucks.length > 0); // Only show dispatchers with empty trucks
  }, [activeTab, filterReportsByOffice, showEmptyTrucks, showNewDrivers]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
                <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
                <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
                {[...Array(7)].map((_, idx) => (
                  <div key={idx} className="col-span-1 h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8 text-destructive">
          Error loading reports: {error.message}
        </div>
      </div>
    );
  }
  const handleNoteChange = async (truckId: string, newValue: string) => {
    try {
      await updateTruckNote.mutateAsync({
        truckId,
        note: newValue,
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the note.",
        variant: "destructive",
      });
    }
  };

  const handleGameOverClick = (truckId: string, driverName: string) => {
    // Find existing "game over" dates for this truck
    const allTrucks = groupedReports?.flatMap((group) => group.trucks) || [];
    const truck = allTrucks.find((t) => t.id === truckId);
    const existingGameOverDates =
      truck?.lostDayNotes
        ?.filter((note: any) => note.note.toLowerCase().includes("game over"))
        .map((note: any) => note.date) || [];

    setGameOverDialog({
      truckId,
      truckNumber: driverName,
      existingDates: existingGameOverDates,
    });
    setGameOverStartDate(undefined);
    setGameOverType("yard");
  };

  const handleGameOverConfirm = async () => {
    if (!gameOverDialog || !gameOverStartDate) {
      toast({
        title: "Select a date",
        description: "Please select a date",
        variant: "destructive",
      });
      return;
    }

    try {
      const dateStr = format(gameOverStartDate, "yyyy-MM-dd");
      const noteText = gameOverType === "yard" ? "game over - yard" : "game over - at road";

      await updateLostDayNote.mutateAsync({
        truckId: gameOverDialog.truckId,
        date: dateStr,
        note: noteText,
      });

      toast({
        title: "Status set",
        description: `Set ${gameOverType === "yard" ? "yard status" : "recovery status"} for truck ${gameOverDialog.truckNumber}`,
      });

      setGameOverDialog(null);
      setGameOverStartDate(undefined);
      setGameOverType("yard");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to set status",
        variant: "destructive",
      });
    }
  };

  const handleGameOverRemove = async () => {
    if (!gameOverDialog || gameOverDialog.existingDates.length === 0) {
      toast({
        title: "No game over dates",
        description: "This truck has no game over dates to remove.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Remove all "game over" dates
      for (const date of gameOverDialog.existingDates) {
        await deleteLostDayNote.mutateAsync({
          truckId: gameOverDialog.truckId,
          date,
        });
      }

      toast({
        title: "Game over removed",
        description: `Removed game over for ${gameOverDialog.existingDates.length} day(s) on truck ${gameOverDialog.truckNumber}`,
      });

      setGameOverDialog(null);
      setGameOverStartDate(undefined);
      setGameOverType("yard");
    } catch (error) {
      toast({
        title: "Failed to remove game over",
        description: "There was an error removing game over status.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="h-full bg-background flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
          <div className="px-4 pt-2 sticky top-0 bg-background z-[101] border-b border-border">
            {/* Filters Section */}
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Truck # / Driver name"
                value={truckDriverFilter}
                onChange={(e) => setTruckDriverFilter(e.target.value)}
                className="max-w-[200px]"
              />
              <Input
                placeholder="Dispatch name"
                value={dispatchNameFilter}
                onChange={(e) => setDispatchNameFilter(e.target.value)}
                className="max-w-[180px]"
              />
              <Input
                placeholder="Load # (Broker load)"
                value={loadNumberFilter}
                onChange={(e) => setLoadNumberFilter(e.target.value)}
                className="max-w-[200px]"
              />
              {(truckDriverFilter || dispatchNameFilter || loadNumberFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTruckDriverFilter("");
                    setDispatchNameFilter("");
                    setLoadNumberFilter("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between mb-2">
              <TabsList className="grid grid-cols-4 flex-1">
                {offices.map((office) => (
                  <TabsTrigger key={office} value={office}>
                    {office}
                  </TabsTrigger>
                ))}
              </TabsList>
              {(hasRole("supervisor") || hasRole("manager") || hasRole("admin") || hasRole("safety")) && (
                <div className="flex gap-2 ml-4">
                  <Button
                    variant={showEmptyTrucks ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowEmptyTrucks(!showEmptyTrucks)}
                  >
                    Empty trucks
                  </Button>
                  <Button
                    variant={showNewDrivers ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowNewDrivers(!showNewDrivers)}
                    className="gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    New drivers
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Only render the active tab content */}
          <TabsContent value={activeTab} className="mt-0 flex-1 overflow-auto">
            {activeOfficeReports.length === 0 ? (
              <div className="p-4">
                <div className="text-center py-12 text-muted-foreground">
                  No trucks assigned to dispatchers in {activeTab}
                </div>
              </div>
            ) : (
              <div className="px-4 py-2">
                {activeOfficeReports.map((group) => {
                  const startDate = getCalendarStartDate(group.dispatcherId);
                  const days = Array.from(
                    {
                      length: 6,
                    },
                    (_, i) => addDays(startDate, i),
                  );
                  return (
                    <div key={group.dispatcherId} className="bg-card">
                      {/* Google Sheets-style table */}
                      <div className="w-full">
                        <table
                          className="w-full border-collapse bg-card border-[3px] border-gray-400"
                          style={{
                            tableLayout: "auto",
                          }}
                        >
                          <thead>
                            {/* Date Range Selector Row with Dispatcher Name */}
                            <tr className="bg-muted/50 sticky top-0 z-20">
                              <th
                                colSpan={3}
                                className="border-r border-b-[2px] border-gray-400 px-2 py-1 text-left font-bold text-foreground bg-muted/50"
                                style={{
                                  fontSize: "0.825rem",
                                }}
                              >
                                {group.dispatcher} ({group.trucks.length} truck{group.trucks.length !== 1 ? "s" : ""})
                                {group.ext && (
                                  <span className="text-xs font-normal text-muted-foreground ml-2">
                                    ext {group.ext}
                                  </span>
                                )}
                              </th>
                              <th colSpan={6} className="border-r border-b-[2px] border-gray-400 px-2 py-1 bg-muted/50">
                                <div className="flex items-center justify-center">
                                  <button
                                    onClick={() => handleCalendarDateChange(group.dispatcherId, addDays(startDate, -1))}
                                    className="p-0.5 hover:bg-muted rounded"
                                  >
                                    <ChevronLeft className="h-3 w-3" />
                                  </button>
                                  <div className="text-xs font-medium text-foreground mx-2">
                                    {format(startDate, "MMM dd")} - {format(addDays(startDate, 5), "MMM dd, yyyy")}
                                  </div>
                                  <button
                                    onClick={() => handleCalendarDateChange(group.dispatcherId, addDays(startDate, 1))}
                                    className="p-0.5 hover:bg-muted rounded"
                                  >
                                    <ChevronRight className="h-3 w-3" />
                                  </button>
                                </div>
                              </th>
                              <th
                                colSpan={4}
                                className="border-r border-b-[2px] border-gray-400 bg-muted/50"
                                style={{
                                  width: "220px",
                                  minWidth: "220px",
                                  maxWidth: "220px",
                                }}
                              ></th>
                              <th
                                colSpan={2}
                                className={`bg-muted/50 border-l border-b-[2px] border-gray-400 px-2 py-1 text-center text-[10px] font-medium text-muted-foreground ${sidebarOpen ? "border-r border-border" : ""}`}
                              >
                                Recent Activity
                              </th>
                            </tr>
                            {/* Column Headers Row */}
                            <tr className="bg-muted/50 sticky top-[37px] z-10">
                              <th className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50 w-16">
                                Truck #
                              </th>
                              <th
                                className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50"
                                style={{
                                  width: "163px",
                                  minWidth: "163px",
                                  maxWidth: "163px",
                                }}
                              >
                                Driver
                              </th>
                              <th
                                className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50"
                                style={{
                                  width: "136px",
                                  minWidth: "136px",
                                  maxWidth: "136px",
                                }}
                              >
                                Home
                              </th>
                              {days.map((day, index) => {
                                const isToday = isSameDay(day, getChicagoToday());
                                return (
                                  <th
                                    key={index}
                                    className={`border-b-[3px] border-gray-400 ${index > 0 ? "border-l border-gray-400" : ""} px-2 py-1 text-center text-[10px] font-medium text-muted-foreground bg-muted/50 relative`}
                                    style={{
                                      width: "120px",
                                      minWidth: "120px",
                                      maxWidth: "120px",
                                      ...(isToday
                                        ? {
                                            position: "relative",
                                            zIndex: 10,
                                          }
                                        : {}),
                                    }}
                                  >
                                    {/* Red border overlay for today header */}
                                    {isToday && (
                                      <div
                                        className="absolute pointer-events-none"
                                        style={{
                                          top: 0,
                                          left: 0,
                                          right: 0,
                                          bottom: 0,
                                          borderLeft: "6px solid #dc2626",
                                          borderRight: "6px solid #dc2626",
                                          borderTop: "6px solid #dc2626",
                                          borderBottom: "6px solid hsl(var(--border))",
                                          zIndex: 100,
                                        }}
                                      />
                                    )}
                                    <div className="relative z-10 text-[10px]">{format(day, "EEEE")}</div>
                                    <div className="text-[9px] text-muted-foreground relative z-10">
                                      {format(day, "M/d/yyyy")}
                                    </div>
                                  </th>
                                );
                              })}
                              <th
                                colSpan={4}
                                className="border-t border-l border-r border-b-[3px] border-gray-400 px-2 py-0.5 text-center text-[10px] font-medium text-muted-foreground bg-muted/50"
                                style={{
                                  width: "220px",
                                  minWidth: "220px",
                                  maxWidth: "220px",
                                }}
                              >
                                Away (D) | Drive | Shift | Break | Cycle
                              </th>
                              <th className="border-t border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50 w-20">
                                Last Edit
                              </th>
                              <th
                                className={`border-t border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50 w-20 ${sidebarOpen ? "border-r border-border" : ""}`}
                              >
                                Date
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.trucks
                              .slice(0, visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT)
                              .map((truck, truckIndex) => {
                                const modifiedCells = renderTruckCalendarCells(
                                  truck,
                                  startDate,
                                  truckIndex,
                                  group.trucks.length,
                                );
                                const isLastTruck = truckIndex === group.trucks.length - 1;
                                const isMapExpanded = expandedTruckMap === truck.id;

                                // Get current order (earliest order without POD based on pickup datetime) - exclude GAME-OVER blocks
                                const currentOrder = truck.allOrders
                                  ?.filter(
                                    (order) =>
                                      order.notes !== "GAME|OVER" &&
                                      !order.order_files?.some((file: any) => file.file_category === "POD"),
                                  )
                                  .sort((a, b) => {
                                    // Sort by pickup datetime ascending (earliest first)
                                    const aDate = new Date(a.pickup_datetime || "9999-12-31").getTime();
                                    const bDate = new Date(b.pickup_datetime || "9999-12-31").getTime();
                                    return aDate - bDate;
                                  })[0];

                                // Extract pickup and delivery stops from pickup_drops
                                if (currentOrder && currentOrder.pickup_drops) {
                                  currentOrder.pickupStop = currentOrder.pickup_drops.find(
                                    (pd: any) => pd.type === "pickup",
                                  );
                                  currentOrder.deliveryStop = currentOrder.pickup_drops.find(
                                    (pd: any) => pd.type === "delivery",
                                  );
                                }

                                const hasBOL =
                                  currentOrder?.order_files?.some((file: any) => file.file_category === "BOL") || false;
                                const hasPOD =
                                  currentOrder?.order_files?.some((file: any) => file.file_category === "POD") || false;
                                const pickupArrived = !!currentOrder?.pickupStop?.arrived_at;

                                // Check if any HOS timer is 0 or below
                                const hasExpiredHOS =
                                  truck.driveMinutes <= 0 ||
                                  truck.shiftMinutes <= 0 ||
                                  truck.breakMinutes <= 0 ||
                                  truck.cycleMinutes <= 0;

                                // Get drug test styling and check if driver is new
                                const isNew = isNewDriver(truck);
                                const canManageDrugTests = hasRole("safety") || hasRole("manager") || hasRole("admin");
                                const drugTestStyle = getDrugTestCellStyle(truck);
                                const shouldShowDrugTestUI = isNew && canManageDrugTests;

                                return (
                                  <React.Fragment key={truck.id}>
                                    <tr className={truckIndex % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                                      <td
                                        className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs font-medium ${shouldShowDrugTestUI ? "cursor-pointer hover:opacity-80" : ""}`}
                                        style={{
                                          width: "77px",
                                          minWidth: "77px",
                                          maxWidth: "77px",
                                          ...drugTestStyle,
                                        }}
                                        onClick={() => {
                                          if (shouldShowDrugTestUI && truck.driverId) {
                                            console.log("Opening drug test dialog for:", {
                                              driverId: truck.driverId,
                                              driverName: truck.driver,
                                              truckId: truck.id,
                                              truckNumber: truck.truckNumber,
                                            });
                                            setDrugTestDialog({
                                              driverId: truck.driverId,
                                              driverName: truck.driver,
                                              truckId: truck.id,
                                            });
                                          }
                                        }}
                                      >
                                        <div className="flex items-center gap-1">
                                          {truck.truckNumber}
                                          {hasExpiredHOS && <Clock className="h-3 w-3 text-destructive" />}
                                          {truck.hasMultipleOrders && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipContent>
                                                  <p className="text-[10px]">
                                                    {truck.totalOrdersCount} total orders ({truck.activeOrdersCount}{" "}
                                                    active)
                                                  </p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                        </div>
                                      </td>
                                      <td
                                        className="border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs"
                                        style={{
                                          width: "163px",
                                          minWidth: "163px",
                                          maxWidth: "163px",
                                        }}
                                      >
                                        <div className="flex items-center gap-2">
                                          {truck.driver}
                                          {(truck.driverPhone ||
                                            truck.driverEmail ||
                                            truck.trailerNumber ||
                                            truck.driver2Name) && (
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <button className="inline-flex">
                                                  <Info className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto">
                                                <div className="space-y-1">
                                                  {truck.driver2Name ? (
                                                    <>
                                                      <p className="font-semibold text-sm">
                                                        Driver 1: {truck.driver1Name}
                                                      </p>
                                                      {truck.driverPhone && (
                                                        <p className="text-xs">📞 {truck.driverPhone}</p>
                                                      )}
                                                      {truck.driverEmail && (
                                                        <p className="text-xs">✉️ {truck.driverEmail}</p>
                                                      )}
                                                      <div className="border-t pt-1 mt-1">
                                                        <p className="font-semibold text-sm">
                                                          Driver 2: {truck.driver2Name}
                                                        </p>
                                                        {truck.driver2Phone && (
                                                          <p className="text-xs">📞 {truck.driver2Phone}</p>
                                                        )}
                                                        {truck.driver2Email && (
                                                          <p className="text-xs">✉️ {truck.driver2Email}</p>
                                                        )}
                                                      </div>
                                                      <div className="border-t pt-1 mt-1">
                                                        <p className="text-xs">🚚 Truck: {truck.truckNumber}</p>
                                                        {truck.trailerNumber && (
                                                          <p className="text-xs">🚛 Trailer: {truck.trailerNumber}</p>
                                                        )}
                                                      </div>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <p className="font-semibold text-sm">{truck.driver}</p>
                                                      <p className="text-xs">🚚 Truck: {truck.truckNumber}</p>
                                                      {truck.trailerNumber && (
                                                        <p className="text-xs">🚛 Trailer: {truck.trailerNumber}</p>
                                                      )}
                                                      {truck.driverPhone && (
                                                        <p className="text-xs">📞 {truck.driverPhone}</p>
                                                      )}
                                                      {truck.driverEmail && (
                                                        <p className="text-xs">✉️ {truck.driverEmail}</p>
                                                      )}
                                                    </>
                                                  )}
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          )}
                                        </div>
                                      </td>
                                      <td
                                        className="border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs"
                                        style={{
                                          width: "136px",
                                          minWidth: "136px",
                                          maxWidth: "136px",
                                        }}
                                      >
                                        <div
                                          className="flex items-center gap-1"
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                        >
                                          {!truck.home || truck.home === "—" ? (
                                            <TruckMapDialog
                                              truckNumber={truck.truckNumber}
                                              truckId={truck.id}
                                              pickupAddress={
                                                currentOrder?.pickupStop
                                                  ? `${currentOrder.pickupStop.address || ""}, ${currentOrder.pickupStop.city || ""}, ${currentOrder.pickupStop.state || ""} ${currentOrder.pickupStop.zip_code || ""}`.trim()
                                                  : undefined
                                              }
                                              deliveryAddress={
                                                currentOrder?.deliveryStop
                                                  ? `${currentOrder.deliveryStop.address || ""}, ${currentOrder.deliveryStop.city || ""}, ${currentOrder.deliveryStop.state || ""} ${currentOrder.deliveryStop.zip_code || ""}`.trim()
                                                  : undefined
                                              }
                                              pickupDate={truck.pickup?.date}
                                              pickupTime={truck.pickup?.time}
                                              deliveryDate={truck.delivery?.date}
                                              deliveryTime={truck.delivery?.time}
                                              loadNumber={currentOrder?.load_number}
                                              brokerLoadNumber={currentOrder?.broker_load_number}
                                              hasBOL={hasBOL}
                                              hasPOD={hasPOD}
                                              pickupArrived={pickupArrived}
                                              isOpen={isMapExpanded}
                                              onOpenChange={(open) => setExpandedTruckMap(open ? truck.id : null)}
                                            >
                                              <MapPin
                                                className="text-destructive cursor-pointer hover:text-destructive/80 transition-colors"
                                                style={{
                                                  width: "12px",
                                                  height: "12px",
                                                  flexShrink: 0,
                                                }}
                                                size={12}
                                              />
                                            </TruckMapDialog>
                                          ) : (
                                            <>
                                              <TruckMapDialog
                                                truckNumber={truck.truckNumber}
                                                truckId={truck.id}
                                                pickupAddress={
                                                  currentOrder?.pickupStop
                                                    ? `${currentOrder.pickupStop.address || ""}, ${currentOrder.pickupStop.city || ""}, ${currentOrder.pickupStop.state || ""} ${currentOrder.pickupStop.zip_code || ""}`.trim()
                                                    : undefined
                                                }
                                                deliveryAddress={
                                                  currentOrder?.deliveryStop
                                                    ? `${currentOrder.deliveryStop.address || ""}, ${currentOrder.deliveryStop.city || ""}, ${currentOrder.deliveryStop.state || ""} ${currentOrder.deliveryStop.zip_code || ""}`.trim()
                                                    : undefined
                                                }
                                                pickupDate={truck.pickup?.date}
                                                pickupTime={truck.pickup?.time}
                                                deliveryDate={truck.delivery?.date}
                                                deliveryTime={truck.delivery?.time}
                                                loadNumber={currentOrder?.load_number}
                                                brokerLoadNumber={currentOrder?.broker_load_number}
                                                hasBOL={hasBOL}
                                                hasPOD={hasPOD}
                                                pickupArrived={pickupArrived}
                                                isOpen={isMapExpanded}
                                                onOpenChange={(open) => setExpandedTruckMap(open ? truck.id : null)}
                                              >
                                                <MapPin
                                                  className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                                  style={{
                                                    width: "12px",
                                                    height: "12px",
                                                    flexShrink: 0,
                                                  }}
                                                  size={12}
                                                />
                                              </TruckMapDialog>
                                              <span className="text-[10px]">{truck.home}</span>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                      {modifiedCells}
                                      {/* Merged cell for Away, Drive, Shift, Cycle with Notes at bottom */}
                                      <td
                                        colSpan={4}
                                        className={`border-r border-b-[6px] border-gray-400 p-0 ${hasExpiredHOS ? "bg-destructive/50" : ""}`}
                                        style={{
                                          height: "64px",
                                        }}
                                      >
                                        <div
                                          className={`h-8 border-b border-border flex items-center justify-around px-1 ${hasExpiredHOS ? "bg-destructive/50" : ""}`}
                                        >
                                          {/* Away Days - Show distance in miles if available */}
                                          <div className="flex flex-col items-center">
                                            <div className="text-[9px] text-muted-foreground mb-0">AWAY (D)</div>
                                            {truck.milesAway > 0 ? (
                                              <div className="text-[10px] text-[hsl(var(--info))] font-medium">
                                                {truck.milesAway}
                                              </div>
                                            ) : (
                                              <div className="text-[10px] text-foreground font-medium">
                                                {truck.awayDays}
                                              </div>
                                            )}
                                          </div>

                                          {/* HOS Circular Timers */}
                                          <HosCircularTimer
                                            minutes={truck.driveMinutes}
                                            maxMinutes={11 * 60} // 11 hours max drive time
                                            label="DRIVE"
                                            color="#84cc16" // green
                                            size={31}
                                            strokeWidth={3}
                                          />
                                          <HosCircularTimer
                                            minutes={truck.shiftMinutes}
                                            maxMinutes={14 * 60} // 14 hours max shift time
                                            label="SHIFT"
                                            color="#06b6d4" // cyan
                                            size={31}
                                            strokeWidth={3}
                                          />
                                          <HosCircularTimer
                                            minutes={truck.breakMinutes}
                                            maxMinutes={8 * 60} // 8 hours max break time
                                            label="BREAK"
                                            color="#8b5cf6" // purple
                                            size={31}
                                            strokeWidth={3}
                                          />
                                          <HosCircularTimer
                                            minutes={truck.cycleMinutes}
                                            maxMinutes={70 * 60} // 70 hours max cycle time
                                            label="CYCLE"
                                            color="hsl(var(--muted-foreground))" // muted foreground color
                                            size={31}
                                            strokeWidth={3}
                                          />
                                        </div>
                                        <div className="h-8 p-0 w-full">
                                          <EditableNoteField
                                            truckId={truck.id}
                                            value={truck.note}
                                            handleNoteChange={handleNoteChange}
                                            setNoteDialogContent={setNoteDialogContent}
                                            setNoteDialogOpen={setNoteDialogOpen}
                                            onHistoryClick={setHistoryDialogTruckId}
                                          />
                                        </div>
                                      </td>
                                      <td
                                        className={`border-b-[6px] border-gray-400 px-2 py-1 text-[10px] text-muted-foreground`}
                                        style={{
                                          width: "80px",
                                          minWidth: "80px",
                                          maxWidth: "80px",
                                        }}
                                      >
                                        {truck.lastEdit}
                                      </td>
                                      <td
                                        className={`border-b-[6px] border-gray-400 px-2 py-1 text-[10px] text-muted-foreground ${sidebarOpen ? "border-r border-border" : ""} relative`}
                                        style={{
                                          width: "80px",
                                          minWidth: "80px",
                                          maxWidth: "80px",
                                        }}
                                      >
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="absolute top-1 right-1 h-[23px] w-[23px] p-0.5 bg-background hover:bg-destructive/10 rounded-full z-[50] border border-border"
                                          onClick={() => handleGameOverClick(truck.id, truck.driver)}
                                        >
                                          <XCircle className="h-[19px] w-[19px] text-destructive" />
                                        </Button>
                                        {truck.editDate}
                                      </td>
                                    </tr>
                                    {isMapExpanded && (
                                      <tr key={`${truck.id}-map`}>
                                        <td colSpan={13} className="p-4 border-b-[3px] border-border">
                                          <TruckMapView
                                            truckNumber={truck.truckNumber}
                                            truckId={truck.id}
                                            pickupAddress={
                                              currentOrder?.pickupStop
                                                ? `${currentOrder.pickupStop.address || ""}, ${currentOrder.pickupStop.city || ""}, ${currentOrder.pickupStop.state || ""} ${currentOrder.pickupStop.zip_code || ""}`.trim()
                                                : undefined
                                            }
                                            deliveryAddress={
                                              currentOrder?.deliveryStop
                                                ? `${currentOrder.deliveryStop.address || ""}, ${currentOrder.deliveryStop.city || ""}, ${currentOrder.deliveryStop.state || ""} ${currentOrder.deliveryStop.zip_code || ""}`.trim()
                                                : undefined
                                            }
                                            pickupDate={truck.pickup?.date}
                                            pickupTime={truck.pickup?.time}
                                            deliveryDate={truck.delivery?.date}
                                            deliveryTime={truck.delivery?.time}
                                            loadNumber={currentOrder?.load_number}
                                            brokerLoadNumber={currentOrder?.broker_load_number}
                                            hasBOL={hasBOL}
                                            hasPOD={hasPOD}
                                            pickupArrived={pickupArrived}
                                          />
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                          </tbody>
                        </table>

                        {/* Load More Trigger */}
                        {group.trucks.length > (visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT) && (
                          <div className="flex justify-center py-4">
                            <Button
                              variant="outline"
                              onClick={() => handleLoadMore(group.dispatcherId)}
                              className="w-full max-w-md"
                            >
                              Load More Trucks (
                              {group.trucks.length - (visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT)}{" "}
                              remaining)
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Note Dialog */}
      <Dialog open={noteDialogOpen !== null} onOpenChange={(open) => !open && setNoteDialogOpen(null)}>
        <DialogContent className="max-w-2xl z-[100]">
          <DialogHeader>
            <DialogTitle>Full Note</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Textarea
              value={noteDialogContent}
              onChange={(e) => setNoteDialogContent(e.target.value)}
              className="min-h-[200px] w-full"
              placeholder="Add note..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setNoteDialogOpen(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (noteDialogOpen) {
                    await handleNoteChange(noteDialogOpen, noteDialogContent);
                    setNoteDialogOpen(null);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Game Over Dialog */}
      <Dialog open={gameOverDialog !== null} onOpenChange={(open) => !open && setGameOverDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Driver Status - {gameOverDialog?.truckNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {gameOverDialog?.existingDates && gameOverDialog.existingDates.length > 0 && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm font-medium mb-2">Current Status Dates:</p>
                <div className="text-xs space-y-1">
                  {gameOverDialog.existingDates.map((date) => (
                    <div key={date}>{format(new Date(date), "MMM dd, yyyy")}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-2 block">Status Type</label>
                <ToggleGroup
                  type="single"
                  value={gameOverType}
                  onValueChange={(value: GameOverType) => value && setGameOverType(value)}
                  className="justify-start"
                >
                  <ToggleGroupItem value="yard" className="flex-1">
                    Left truck on the Yard
                  </ToggleGroupItem>
                  <ToggleGroupItem value="at_road" className="flex-1">
                    Recovery On the road
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div>
                <label className="text-sm font-medium">Date</label>
                <DatePicker date={gameOverStartDate} onDateChange={setGameOverStartDate} placeholder="Select date" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleGameOverConfirm} disabled={!gameOverStartDate} className="flex-1">
                Set Status
              </Button>
              {gameOverDialog?.existingDates && gameOverDialog.existingDates.length > 0 && (
                <Button onClick={handleGameOverRemove} variant="destructive" className="flex-1">
                  Remove All
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drug Test Dialog */}
      <Dialog open={!!drugTestDialog} onOpenChange={(open) => !open && setDrugTestDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drug Test Result - {drugTestDialog?.driverName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Test Result</label>
              <Select
                value={getDrugTestForDriver(drugTestDialog?.driverId || "")?.result || "pending"}
                onValueChange={(value) => {
                  if (drugTestDialog?.driverId && drugTestDialog?.truckId) {
                    console.log("Updating drug test:", {
                      driverId: drugTestDialog.driverId,
                      driverName: drugTestDialog.driverName,
                      truckId: drugTestDialog.truckId,
                      result: value,
                    });
                    upsertDrugTest.mutate({
                      driverId: drugTestDialog.driverId,
                      result: value as "positive" | "negative" | "pending",
                      truckId: drugTestDialog.truckId,
                    });
                  }
                }}
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
          </div>
        </DialogContent>
      </Dialog>

      <TruckNoteHistoryDialog
        truckId={historyDialogTruckId}
        open={!!historyDialogTruckId}
        onOpenChange={(open) => !open && setHistoryDialogTruckId(null)}
      />
    </>
  );
};

export default Reports;
