import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X, ChevronLeft, ChevronRight, Info, Clock, Maximize2, XCircle, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { HosCircularTimer } from "@/components/HosCircularTimer";
import { useReports } from "@/hooks/useReports";
import { useDriverDrugTests } from "@/hooks/useDriverDrugTests";
import { useSamsaraLocations } from "@/hooks/useSamsaraLocations";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo, memo, useRef, useCallback } from "react";
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
  const categoryOrder = ['RC', 'BOL', 'POD', 'ADDITIONAL'];
  const foundCategories = new Set<string>();
  const orderedDocs: string[] = [];
  
  categoryOrder.forEach(category => {
    const doc = documents.find(d => d.category === category && !foundCategories.has(d.category));
    if (doc) {
      foundCategories.add(doc.category);
      orderedDocs.push(doc.category);
    }
  });
  
  return orderedDocs.length > 0 ? orderedDocs.join(', ') : 'None';
};

// EditableNoteField component to avoid hooks violation
const EditableNoteField = ({ 
  truckId, 
  value, 
  handleNoteChange,
  setNoteDialogContent,
  setNoteDialogOpen
}: { 
  truckId: string; 
  value: string; 
  handleNoteChange: (truckId: string, value: string) => Promise<void>;
  setNoteDialogContent: (value: string) => void;
  setNoteDialogOpen: (truckId: string | null) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const hasContent = value && value.trim().length > 0 && value.trim() !== "Add note...";
  
  return (
    <div className="relative w-full h-full group">
      {isEditing ? (
        <Textarea
          defaultValue={value || ""}
          autoFocus
          onBlur={(e) => {
            handleNoteChange(truckId, e.target.value);
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsEditing(false);
            }
          }}
          className={`text-[0.624rem] font-bold border-none rounded-none resize-none text-left ${hasContent ? 'bg-purple-500/20' : 'bg-transparent'} focus:outline-none focus:ring-0 focus:border-transparent p-1 w-full leading-tight`}
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
          className={`text-[0.624rem] font-bold cursor-text ${hasContent ? 'bg-purple-500/20' : 'bg-transparent'} p-1 w-full h-full overflow-hidden leading-tight line-clamp-2`}
          style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px",
            lineHeight: "14px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
          title={value || ""}
        >
          {hasContent ? value : <span className="text-muted-foreground">Add note...</span>}
        </div>
      )}
      {hasContent && !isEditing && (
        <Maximize2 
          className="absolute top-0.5 right-0.5 h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={() => {
            setNoteDialogContent(value || "");
            setNoteDialogOpen(truckId);
          }}
        />
      )}
    </div>
  );
};

const Reports = () => {
  const { profile, hasRole } = useAuthContext();
  const navigate = useNavigate();
  const [showEmptyTrucks, setShowEmptyTrucks] = useState(false);
  const [showNewDrivers, setShowNewDrivers] = useState(false);
  const [drugTestDialog, setDrugTestDialog] = useState<{ driverId: string; driverName: string } | null>(null);
  const { drugTests, upsertDrugTest, getDrugTestForDriver } = useDriverDrugTests();

  // Helper function to check if a driver is "new" (no loads or exactly 1 load with pickup today)
  const isNewDriver = useCallback((truck: any) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const realOrders = truck.allOrders?.filter((order: any) => 
      order.notes !== 'GAME|OVER'
    ) || [];
    
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
  const getDrugTestCellStyle = useCallback((truck: any) => {
    if (!truck.driverId) return {};
    
    const drugTest = getDrugTestForDriver(truck.driverId);
    const isNew = isNewDriver(truck);
    
    if (!isNew) return {};
    
    if (drugTest?.result === 'positive') {
      return { backgroundColor: 'hsl(0, 72%, 53%)', color: 'white' };
    } else if (drugTest?.result === 'negative') {
      return { backgroundColor: 'hsl(142, 76%, 36%)', color: 'white' };
    }
    
    return {};
  }, [getDrugTestForDriver, isNewDriver]);

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
  const offices = ["Čačak", "KRAGUJEVAC", "BEOGRAD", "Recovery drivers"];

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
  } = useReports();
  const { data: samsaraLocations, isLoading: isLoadingSamsara } = useSamsaraLocations();
  const queryClient = useQueryClient();
  
  // Delete lost day note mutation
  const deleteLostDayNote = useMutation({
    mutationFn: async ({ truckId, date }: { truckId: string; date: string }) => {
      const { error } = await supabase
        .from('lost_day_notes')
        .delete()
        .eq('truck_id', truckId)
        .eq('date', date);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
  
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [calendarDates, setCalendarDates] = useState<DispatcherCalendarState>({});
  const [expandedTruckMap, setExpandedTruckMap] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(getInitialTab());
  const [visibleTrucks, setVisibleTrucks] = useState<{ [dispatcherId: string]: number }>({});
  const [noteDialogOpen, setNoteDialogOpen] = useState<string | null>(null);
  const [noteDialogContent, setNoteDialogContent] = useState<string>("");
  const [truckMapView, setTruckMapView] = useState<{ truckNumber: string; latitude: number; longitude: number } | null>(null);
  const [gameOverDialog, setGameOverDialog] = useState<GameOverDialogState | null>(null);
  const [gameOverStartDate, setGameOverStartDate] = useState<Date | undefined>(undefined);
  const [gameOverType, setGameOverType] = useState<GameOverType>("yard");
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
          updates.datetime = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:00`;
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
          updates.datetime = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:00`;
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
      if (previousLoadDeliveryComplete)
        return "bg-[#00FFFF] text-black border-border";
      return "bg-[hsl(var(--cell-pending))] text-[hsl(var(--cell-pending-foreground))] border-border";
    };

    // Helper to get delivery cell color based on status
    const getDeliveryCellColor = (order: any) => {
      const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
      const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
      const hasArrived = order.deliveryStop?.arrived_at;
      if (hasPOD) return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
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
        ?.flatMap((order: any) => {
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
          const pickupStopsByDateArray = new Map<string, any[]>();
          const deliveryStopsByDateArray = new Map<string, any[]>();

          order.pickupStops?.forEach((stop: any) => {
            if (stop.datetime) {
              const stopDate = formatDateTime(stop.datetime, "yyyy-MM-dd");
              pickupStopsByDate.set(stopDate, (pickupStopsByDate.get(stopDate) || 0) + 1);
              if (!pickupStopsByDateArray.has(stopDate)) {
                pickupStopsByDateArray.set(stopDate, []);
              }
              pickupStopsByDateArray.get(stopDate)!.push(stop);
            }
          });

          order.deliveryStops?.forEach((stop: any) => {
            if (stop.datetime) {
              const stopDate = formatDateTime(stop.datetime, "yyyy-MM-dd");
              deliveryStopsByDate.set(stopDate, (deliveryStopsByDate.get(stopDate) || 0) + 1);
              if (!deliveryStopsByDateArray.has(stopDate)) {
                deliveryStopsByDateArray.set(stopDate, []);
              }
              deliveryStopsByDateArray.get(stopDate)!.push(stop);
            }
          });

          // Check if all stops are on different dates
          const allPickupDates = Array.from(pickupStopsByDate.keys());
          const allDeliveryDates = Array.from(deliveryStopsByDate.keys());
          const hasMultipleDates = allPickupDates.length + allDeliveryDates.length > 1;
          
          // Check if all stops are on the same date
          const allDates = new Set([...allPickupDates, ...allDeliveryDates]);
          const allStopsOnSameDate = allDates.size === 1;

          // If all stops are on same date OR single pick/drop, show combined view (current behavior)
          if (allStopsOnSameDate || !hasMultipleDates) {
            return [{
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
            }];
          }

          // Multi-date load: create separate entries for each stop with different dates
          const expandedOrders: any[] = [];
          
          // Store the full date range for in-transit detection
          const firstPickupDate = pickupDate;
          const lastDeliveryDate = deliveryDate;
          
          // Add pickup stops
          allPickupDates.forEach(dateStr => {
            const stops = pickupStopsByDateArray.get(dateStr) || [];
            const firstStop = stops[0];
            const parsed = parseSimpleDateTime(firstStop.datetime);
            const stopDate = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
            
            expandedOrders.push({
              ...order,
              pickupDate: stopDate,
              deliveryDate: null,
              originalPickupDate: firstPickupDate,
              originalDeliveryDate: lastDeliveryDate,
              pickupStopsByDate,
              deliveryStopsByDate,
              pickupLocation: firstStop.city && firstStop.state
                ? `${firstStop.city}, ${firstStop.state}`
                : firstStop.address || "—",
              deliveryLocation: "—",
              pickupStop: firstStop,
              deliveryStop: null,
              pickup_datetime: firstStop.datetime,
              pickup_end_datetime: order.pickup_end_datetime,
              isMultiStopExpanded: true,
              stopType: 'pickup'
            });
          });

          // Add delivery stops
          allDeliveryDates.forEach(dateStr => {
            const stops = deliveryStopsByDateArray.get(dateStr) || [];
            const lastStop = stops[stops.length - 1];
            const parsed = parseSimpleDateTime(lastStop.datetime);
            const stopDate = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
            
            expandedOrders.push({
              ...order,
              pickupDate: null,
              deliveryDate: stopDate,
              originalPickupDate: firstPickupDate,
              originalDeliveryDate: lastDeliveryDate,
              pickupStopsByDate,
              deliveryStopsByDate,
              pickupLocation: "—",
              deliveryLocation: lastStop.city && lastStop.state
                ? `${lastStop.city}, ${lastStop.state}`
                : lastStop.address || "—",
              pickupStop: null,
              deliveryStop: lastStop,
              delivery_datetime: lastStop.datetime,
              delivery_end_datetime: order.delivery_end_datetime,
              isMultiStopExpanded: true,
              stopType: 'delivery'
            });
          });

          return expandedOrders;
        })
        .sort((a, b) => {
          // Sort by pickup date, then delivery date
          const aDate = a.pickupDate || a.deliveryDate;
          const bDate = b.pickupDate || b.deliveryDate;
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return aDate.getTime() - bDate.getTime();
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
                  ...(isFirstTruck ? { borderTop: "6px solid #dc2626" } : {}),
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
      const allDayOrders = ordersWithDates.filter(
        (order) =>
          (order.pickupDate && isSameDay(day, order.pickupDate)) ||
          (order.deliveryDate && isSameDay(day, order.deliveryDate)),
      );

      // Separate same-day orders from different-day orders
      const sameDayOrders = allDayOrders.filter((order) => isSameDayPickupDelivery(order));
      const pickupOnlyOrders = allDayOrders.filter(
        (order) => order.pickupDate && isSameDay(day, order.pickupDate) && !isSameDayPickupDelivery(order),
      );
      const deliveryOnlyOrders = allDayOrders.filter(
        (order) => order.deliveryDate && isSameDay(day, order.deliveryDate) && !isSameDayPickupDelivery(order),
      );

      // Count total stops for this day (sum of all pickup/delivery stops from all orders)
      const dayStr = format(day, "yyyy-MM-dd");
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
        // For expanded multi-stop orders, use the original date range
        const pickupDateToCheck = order.originalPickupDate || order.pickupDate;
        const deliveryDateToCheck = order.originalDeliveryDate || order.deliveryDate;
        
        if (!pickupDateToCheck || !deliveryDateToCheck || isSameDayPickupDelivery(order)) return false;
        const dayTime = day.getTime();
        const pickupTime = pickupDateToCheck.getTime();
        const deliveryTime = deliveryDateToCheck.getTime();
        // Day is in transit if it's after pickup and before delivery
        // This includes future loads that haven't been picked up yet (2-3 day loads)
        return dayTime > pickupTime && dayTime < deliveryTime;
      });
      // Only show in-transit if there are no other orders on this day
      const isInTransit = inTransitOrders.length > 0 && allDayOrders.length === 0;
      
      // Check if this is a multi-stop expanded in-transit day
      // Only mark as multi-stop in-transit if ALL in-transit orders for this day are expanded multi-stop
      const isMultiStopInTransit = isInTransit && inTransitOrders.length > 0 && inTransitOrders.every(order => order.isMultiStopExpanded);

      // Check if there's a game over day before this day
      const hasGameOverBefore = days.slice(0, index).some(prevDay => {
        const check = isGameOverDay(prevDay);
        return check.isGameOver;
      });

      // Check if this is a missing pickup (red XXX) - empty pickup cell after first pickup
      // Lost day should only appear AFTER a delivery and BEFORE the next pickup
      // NOT between consecutive deliveries
      const isEmptyPickup = pickupOnlyOrders.length === 0 && sameDayOrders.length === 0;
      const isAfterFirstPickup = firstPickupDate && day >= firstPickupDate;
      const isWithinTimeframe = day <= oneDayInFuture;
      
      // Find the most recent day with activity before this day
      const previousDaysWithOrders = days.slice(0, index).filter(prevDay => {
        const prevDayOrders = ordersWithDates.filter(
          (order) =>
            (order.pickupDate && isSameDay(prevDay, order.pickupDate)) ||
            (order.deliveryDate && isSameDay(prevDay, order.deliveryDate))
        );
        return prevDayOrders.length > 0;
      });
      
      // Check if the most recent activity was a delivery (not a pickup)
      let lastActivityWasDelivery = false;
      if (previousDaysWithOrders.length > 0) {
        const lastActivityDay = previousDaysWithOrders[previousDaysWithOrders.length - 1];
        const lastDayOrders = ordersWithDates.filter(
          (order) =>
            (order.pickupDate && isSameDay(lastActivityDay, order.pickupDate)) ||
            (order.deliveryDate && isSameDay(lastActivityDay, order.deliveryDate))
        );
        // If last day had any delivery, it counts as delivery day
        lastActivityWasDelivery = lastDayOrders.some(order => 
          order.deliveryDate && isSameDay(lastActivityDay, order.deliveryDate)
        );
      }
      
      const isMissingPickup = isEmptyPickup && isAfterFirstPickup && isWithinTimeframe && !isMultiStopInTransit && !hasGameOverBefore && lastActivityWasDelivery;

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
          {/* Red border overlay for today column - sits on top of everything */}
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
                ...(isFirstTruck
                  ? {
                      borderTop: "6px solid #dc2626",
                    }
                  : {}),
                ...(isLastTruck
                  ? {
                      borderBottom: "6px solid #dc2626",
                    }
                  : {}),
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
              className={`border-b ${!isToday && index > 0 ? 'border-l' : ''} ${!isToday ? 'border-r' : ''} border-gray-400 flex flex-col ${isToday ? 'px-[2%]' : ''} ${deliveryOnlyOrders.length > 0 ? "" : isMultiStopInTransit ? "bg-[#D4A017]" : isInTransit ? "bg-[hsl(var(--cell-loading))]" : "bg-muted"}`}
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              {deliveryOnlyOrders.length > 0 ? (
                <div className="space-y-0.5 flex-1 p-0 overflow-hidden flex flex-col">
                  {deliveryOnlyOrders.slice(0, 1).map((order, idx) => {
                    const cellColor = getDeliveryCellColor(order);
                    const totalDeliveryStops = order.pickupStopsByDate?.get(format(day, "yyyy-MM-dd")) || 1;
                    return (
                      <div
                        key={`delivery-${order.id}-${idx}`}
                        className={`${cellColor} border rounded relative flex flex-col px-1 py-1 flex-1`}
                      >
                        {
                          <>
                            <div className="text-[10px] font-medium truncate leading-tight">
                              {order.deliveryLocation}
                              {totalDeliveryStops > 1 ? ` (${totalDeliveryStops})` : ""}
                            </div>
                            <div className="text-[9px] opacity-70 truncate leading-tight">
                              {order.delivery_datetime &&
                              order.delivery_end_datetime &&
                              formatTime(order.delivery_datetime) !== formatTime(order.delivery_end_datetime)
                                ? `${formatTime(order.delivery_datetime)} - ${formatTime(order.delivery_end_datetime)}`
                                : order.delivery_datetime
                                  ? formatTime(order.delivery_datetime)
                                  : "—"}
                            </div>
                          </>
                        }
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-1 right-1 h-3 w-3 p-0 hover:bg-background/20"
                            >
                              <Info className="h-2 w-2" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 z-[101]">
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">Load Information</h4>
                              </div>
                              <div className="space-y-3">
                                {deliveryOnlyOrders.map((deliveryOrder, idx) => (
                                  <div
                                    key={`delivery-info-${deliveryOrder.id}`}
                                    className={`${idx > 0 ? "border-t pt-2" : ""}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <p className="font-semibold">• Load #: {deliveryOrder.loadDetails.loadNumber}</p>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2"
                                        onClick={() => navigate(`/edit-order/${deliveryOrder.id}`)}
                                      >
                                        <Edit3 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <p className="ml-4">
                                      • <strong>Broker Load #:</strong> {deliveryOrder.loadDetails.brokerLoadNumber}
                                    </p>
                                    {deliveryOrder.loadDetails.allPickupStops &&
                                      deliveryOrder.loadDetails.allPickupStops.length > 0 && (
                                        <>
                                          <p className="ml-4 font-semibold">
                                            • Pickups ({deliveryOrder.loadDetails.allPickupStops.length}):
                                          </p>
                                          {deliveryOrder.loadDetails.allPickupStops.map((pickup, pIdx) => (
                                            <p key={`pickup-${pIdx}`} className="ml-8">
                                              - {pickup.address}, {pickup.city}, {pickup.state} {pickup.zipCode} at{" "}
                                              {formatDateTime(pickup.datetime, "MM/dd, HH:mm")}
                                            </p>
                                          ))}
                                        </>
                                      )}
                                    {deliveryOrder.loadDetails.allDeliveryStops &&
                                      deliveryOrder.loadDetails.allDeliveryStops.length > 0 && (
                                        <>
                                          <p className="ml-4 font-semibold">
                                            • Deliveries ({deliveryOrder.loadDetails.allDeliveryStops.length}):
                                          </p>
                                          {deliveryOrder.loadDetails.allDeliveryStops.map((delivery, dIdx) => (
                                            <p key={`delivery-${dIdx}`} className="ml-8">
                                              - {delivery.address}, {delivery.city}, {delivery.state} {delivery.zipCode}{" "}
                                              at {formatDateTime(delivery.datetime, "MM/dd, HH:mm")}
                                            </p>
                                          ))}
                                        </>
                                      )}
                                    <p className="ml-4">
                                      • <strong>Documents:</strong>{" "}
                                      {formatDocuments(deliveryOrder.loadDetails.documents)}
                                    </p>
                                    {deliveryOrder.loadDetails.notes !== "—" && (
                                      <p className="ml-4 text-sm font-bold">
                                        • <strong>Notes:</strong> {deliveryOrder.loadDetails.notes}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {order.deliveryStop?.id && !order.deliveryStop?.arrived_at && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    updatePickupDropArrival.mutate({
                                      pickupDropId: order.deliveryStop.id,
                                    });
                                    toast({
                                      title: "Marked as arrived at delivery",
                                    });
                                  }}
                                  className="w-full mt-2"
                                >
                                  Arrived at Delivery
                                </Button>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    );
                  })}
                  {deliveryOnlyOrders.length > 1 && (
                    <div className="text-[9px] text-muted-foreground text-center leading-tight">
                      +{deliveryOnlyOrders.length - 1} more
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`h-full flex items-center justify-center ${isMultiStopInTransit ? "text-[#e2ddd5] font-bold text-sm" : isInTransit ? "text-foreground font-semibold text-xs" : "text-muted-foreground text-xs"}`}
                >
                  {isMultiStopInTransit ? ">>>" : isInTransit ? ">>>" : "—"}
                </div>
              )}
            </div>

            {/* Pickup cell (bottom half) - includes same-day orders */}
            <div
              className={`${!isToday && index > 0 ? 'border-l' : ''} ${!isToday ? 'border-r' : ''} border-gray-400 flex flex-col ${isToday ? 'px-[2%]' : ''} ${pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? "" : isMissingPickup ? "bg-[hsl(0_72%_53%)] dark:bg-[hsl(var(--destructive-light))]" : isMultiStopInTransit ? "bg-[#D4A017]" : isInTransit ? "bg-[hsl(var(--cell-loading))]" : "bg-muted"}`}
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              {pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? (
                <div className="space-y-0.5 flex-1 p-0 overflow-hidden flex flex-col">
                  {/* Render pickup-only orders first */}
                  {pickupOnlyOrders.slice(0, 1).map((order, idx) => {
                    const previousComplete = getPreviousLoadDeliveryStatus(order);
                    const cellColor = getPickupCellColor(order, previousComplete);
                    return (
                      <div
                        key={`pickup-${order.id}-${idx}`}
                        className={`${cellColor} border rounded relative flex flex-col px-1 py-1 flex-1`}
                      >
                        {
                          <>
                            <div className="text-[10px] font-medium truncate leading-tight">
                              {order.pickupLocation}
                              {totalPickupStops > 1 ? ` (${totalPickupStops})` : ""}
                            </div>
                            <div className="text-[9px] opacity-70 truncate leading-tight">
                              {order.pickup_datetime &&
                              order.pickup_end_datetime &&
                              formatTime(order.pickup_datetime) !== formatTime(order.pickup_end_datetime)
                                ? `${formatTime(order.pickup_datetime)} - ${formatTime(order.pickup_end_datetime)}`
                                : order.pickup_datetime
                                  ? formatTime(order.pickup_datetime)
                                  : "—"}
                            </div>
                          </>
                        }
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-1 right-1 h-3 w-3 p-0 hover:bg-background/20"
                            >
                              <Info className="h-2 w-2" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 z-[101]">
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">Load Information</h4>
                              </div>
                              <div className="space-y-3">
                                {pickupOnlyOrders.map((pickupOrder, idx) => (
                                  <div
                                    key={`pickup-info-${pickupOrder.id}`}
                                    className={`${idx > 0 ? "border-t pt-2" : ""}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <p className="font-semibold">• Load #: {pickupOrder.loadDetails.loadNumber}</p>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2"
                                        onClick={() => navigate(`/edit-order/${pickupOrder.id}`)}
                                      >
                                        <Edit3 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <p className="ml-4">
                                      • <strong>Broker Load #:</strong> {pickupOrder.loadDetails.brokerLoadNumber}
                                    </p>
                                    {pickupOrder.loadDetails.allPickupStops &&
                                      pickupOrder.loadDetails.allPickupStops.length > 0 && (
                                        <>
                                          <p className="ml-4 font-semibold">
                                            • Pickups ({pickupOrder.loadDetails.allPickupStops.length}):
                                          </p>
                                          {pickupOrder.loadDetails.allPickupStops.map((pickup, pIdx) => (
                                            <p key={`pickup-${pIdx}`} className="ml-8">
                                              - {pickup.address}, {pickup.city}, {pickup.state} {pickup.zipCode} at{" "}
                                              {formatDateTime(pickup.datetime, "MM/dd, HH:mm")}
                                            </p>
                                          ))}
                                        </>
                                      )}
                                    {pickupOrder.loadDetails.allDeliveryStops &&
                                      pickupOrder.loadDetails.allDeliveryStops.length > 0 && (
                                        <>
                                          <p className="ml-4 font-semibold">
                                            • Deliveries ({pickupOrder.loadDetails.allDeliveryStops.length}):
                                          </p>
                                          {pickupOrder.loadDetails.allDeliveryStops.map((delivery, dIdx) => (
                                            <p key={`delivery-${dIdx}`} className="ml-8">
                                              - {delivery.address}, {delivery.city}, {delivery.state} {delivery.zipCode}{" "}
                                              at {formatDateTime(delivery.datetime, "MM/dd, HH:mm")}
                                            </p>
                                          ))}
                                        </>
                                      )}
                                    <p className="ml-4">
                                      • <strong>Documents:</strong>{" "}
                                      {formatDocuments(pickupOrder.loadDetails.documents)}
                                    </p>
                                    {pickupOrder.loadDetails.notes !== "—" && (
                                      <p className="ml-4 text-sm font-bold">
                                        • <strong>Notes:</strong> {pickupOrder.loadDetails.notes}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {order.pickupStop?.id && !order.pickupStop?.arrived_at && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    updatePickupDropArrival.mutate({
                                      pickupDropId: order.pickupStop.id,
                                    });
                                    toast({
                                      title: "Marked as arrived at pickup",
                                    });
                                  }}
                                  className="w-full mt-2"
                                >
                                  Arrived at Pickup
                                </Button>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    );
                  })}

                  {/* Render same-day orders (combined pickup and delivery) */}
                  {sameDayOrders.slice(0, Math.max(0, 1 - pickupOnlyOrders.length)).map((order, idx) => {
                    const previousComplete = getPreviousLoadDeliveryStatus(order);
                    const cellColor = getPickupCellColor(order, previousComplete);
                    return (
                      <div
                        key={`same-day-${order.id}-${idx}`}
                        className={`${cellColor} border rounded relative flex flex-col px-1 py-1 flex-1`}
                      >
                        <div className="text-[10px] font-medium truncate leading-tight">P: {order.pickupLocation}</div>
                        <div className="text-[10px] opacity-70 truncate leading-tight">D: {order.deliveryLocation}</div>
                        <div className="text-[9px] opacity-70 truncate flex justify-between leading-tight">
                          <span>
                            {order.pickup_datetime &&
                            order.pickup_end_datetime &&
                            formatTime(order.pickup_datetime) !== formatTime(order.pickup_end_datetime)
                              ? `${formatTime(order.pickup_datetime)}-${formatTime(order.pickup_end_datetime)}`
                              : order.pickup_datetime
                                ? formatTime(order.pickup_datetime)
                                : "—"}
                          </span>
                          <span>
                            {order.delivery_datetime &&
                            order.delivery_end_datetime &&
                            formatTime(order.delivery_datetime) !== formatTime(order.delivery_end_datetime)
                              ? `${formatTime(order.delivery_datetime)}-${formatTime(order.delivery_end_datetime)}`
                              : order.delivery_datetime
                                ? formatTime(order.delivery_datetime)
                                : "—"}
                          </span>
                        </div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-1 right-1 h-3 w-3 p-0 hover:bg-background/20"
                            >
                              <Info className="h-2 w-2" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 z-[101]">
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
                                {order.loadDetails.pickupInfo && (
                                  <p>
                                    • <strong>Pickup:</strong> {order.loadDetails.pickupInfo.address},{" "}
                                    {order.loadDetails.pickupInfo.city}, {order.loadDetails.pickupInfo.state}{" "}
                                    {order.loadDetails.pickupInfo.zipCode || ""} at{" "}
                                    {(() => {
                                      if (order.loadDetails.pickupInfo.datetime === "—") return "—";
                                      let timeStr = formatDateTime(
                                        order.loadDetails.pickupInfo.datetime,
                                        "MM/dd, HH:mm",
                                      );
                                      if (order.loadDetails.pickupInfo.endDatetime !== "—") {
                                        const endTime = formatTime(order.loadDetails.pickupInfo.endDatetime);
                                        const startTime = formatTime(order.loadDetails.pickupInfo.datetime);
                                        if (startTime !== endTime) {
                                          timeStr += ` - ${endTime}`;
                                        }
                                      }
                                      return timeStr;
                                    })()}
                                  </p>
                                )}
                                {order.loadDetails.deliveryInfo && (
                                  <p>
                                    • <strong>Delivery:</strong> {order.loadDetails.deliveryInfo.address},{" "}
                                    {order.loadDetails.deliveryInfo.city}, {order.loadDetails.deliveryInfo.state}{" "}
                                    {order.loadDetails.deliveryInfo.zipCode || ""} at{" "}
                                    {(() => {
                                      if (order.loadDetails.deliveryInfo.datetime === "—") return "—";
                                      let timeStr = formatDateTime(
                                        order.loadDetails.deliveryInfo.datetime,
                                        "MM/dd, HH:mm",
                                      );
                                      if (order.loadDetails.deliveryInfo.endDatetime !== "—") {
                                        const endTime = formatTime(order.loadDetails.deliveryInfo.endDatetime);
                                        const startTime = formatTime(order.loadDetails.deliveryInfo.datetime);
                                        if (startTime !== endTime) {
                                          timeStr += ` - ${endTime}`;
                                        }
                                      }
                                      return timeStr;
                                    })()}
                                  </p>
                                )}
                                <p>
                                  • <strong>Documents:</strong>{" "}
                                  {formatDocuments(order.loadDetails.documents)}
                                </p>
                                {order.loadDetails.notes !== "—" && (
                                  <p className="text-sm font-bold">
                                    • <strong>Notes:</strong> {order.loadDetails.notes}
                                  </p>
                                )}
                              </div>
                              {order.pickupStop?.id && !order.pickupStop?.arrived_at && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    updatePickupDropArrival.mutate({
                                      pickupDropId: order.pickupStop.id,
                                    });
                                    toast({
                                      title: "Marked as arrived at pickup",
                                    });
                                  }}
                                  className="w-full mt-2"
                                >
                                  Arrived at Pickup
                                </Button>
                              )}
                              {order.deliveryStop?.id && !order.deliveryStop?.arrived_at && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    updatePickupDropArrival.mutate({
                                      pickupDropId: order.deliveryStop.id,
                                    });
                                    toast({
                                      title: "Marked as arrived at delivery",
                                    });
                                  }}
                                  className="w-full mt-2"
                                >
                                  Arrived at Delivery
                                </Button>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    );
                  })}

                  {/* Show +more only for pickup cell activities (pickup-only + same-day orders) */}
                  {pickupOnlyOrders.length + sameDayOrders.length > 1 && (
                    <div className="text-[9px] text-muted-foreground text-center leading-tight">
                      +{pickupOnlyOrders.length + sameDayOrders.length - 1} more
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`h-full flex items-center justify-center ${isMissingPickup ? "text-white dark:text-[hsl(var(--destructive-light-foreground))] font-semibold text-[0.624rem] cursor-pointer hover:bg-[hsl(0_72%_63%)] dark:hover:bg-[hsl(var(--destructive))] transition-colors" : isMultiStopInTransit ? "text-[#e2ddd5] font-bold text-sm" : isInTransit ? "text-foreground font-semibold text-xs" : "text-muted-foreground text-xs"}`}
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
                  {isMissingPickup ? getLostDayNote(day) : isMultiStopInTransit ? ">>>" : isInTransit ? ">>>" : "—"}
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
      return groupedReports.filter((group) => group.office === office);
    };
  }, [groupedReports]);
  
  // Only get filtered reports for the active tab
  const activeOfficeReports = useMemo(() => {
    const reports = filterReportsByOffice(activeTab);
    
    // New drivers filter: show only trucks with no loads ever OR exactly 1 load with pickup today
    if (showNewDrivers) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      return reports
        .map(group => {
          const newDriverTrucks = group.trucks.filter(truck => {
            // Get all non-GAME|OVER orders
            const realOrders = truck.allOrders?.filter((order: any) => 
              order.notes !== 'GAME|OVER'
            ) || [];
            
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
        })
        .filter(group => group.trucks.length > 0);
    }
    
    if (!showEmptyTrucks) {
      return reports;
    }
    
    // Filter to show only trucks with explicit "Empty" or lost day notes for today
    // Exclude trucks showing ">>>" (in transit)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = format(today, "yyyy-MM-dd");
    
    return reports
      .map(group => {
        const emptyTrucks = group.trucks.filter(truck => {
          // Check if truck is in transit today (shows ">>>")
          // A truck shows ">>>" for dates between pickup and delivery
          const isInTransitToday = truck.allOrders?.some((order: any) => {
            if (order.notes === 'GAME|OVER') return false;
            if (!order.pickupStop?.datetime || !order.deliveryStop?.datetime) return false;
            
            const pickupDate = new Date(order.pickupStop.datetime);
            pickupDate.setHours(0, 0, 0, 0);
            const deliveryDate = new Date(order.deliveryStop.datetime);
            deliveryDate.setHours(0, 0, 0, 0);
            
            // Check if today is between pickup and delivery (exclusive of pickup day)
            return today > pickupDate && today <= deliveryDate;
          });
          
          // Exclude trucks in transit
          if (isInTransitToday) {
            return false;
          }
          
          // Check if truck has NO pickup scheduled for today
          const hasPickupToday = truck.allOrders?.some((order: any) => {
            if (order.notes === 'GAME|OVER') return false;
            if (!order.pickupStop?.datetime) return false;
            const pickupDate = new Date(order.pickupStop.datetime);
            pickupDate.setHours(0, 0, 0, 0);
            return isSameDay(pickupDate, today);
          });
          
          // Only show truck if it has NO pickup for today
          if (hasPickupToday) {
            return false;
          }
          
          // Check for explicit lost day note for today
          const todayNote = truck.lostDayNotes?.find((note: any) => note.date === todayStr);
          
          if (todayNote) {
            // Has explicit note - exclude game over types
            const noteText = todayNote.note?.toLowerCase();
            return !noteText?.includes('game over');
          }
          
          // No explicit note, but no pickup and not in transit = would show "Empty" or "Lost day"
          return true;
        });
        
        return {
          ...group,
          trucks: emptyTrucks
        };
      })
      .filter(group => group.trucks.length > 0); // Only show dispatchers with empty trucks
  }, [activeTab, filterReportsByOffice, showEmptyTrucks, showNewDrivers]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
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

  const handleGameOverClick = (truckId: string, truckNumber: string) => {
    // Find existing "game over" dates for this truck
    const allTrucks = groupedReports?.flatMap((group) => group.trucks) || [];
    const truck = allTrucks.find((t) => t.id === truckId);
    const existingGameOverDates = truck?.lostDayNotes
      ?.filter((note: any) => note.note.toLowerCase().includes("game over"))
      .map((note: any) => note.date) || [];
    
    setGameOverDialog({
      truckId,
      truckNumber,
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
            <div className="flex items-center justify-between mb-2">
              <TabsList className="grid grid-cols-4 flex-1">
                {offices.map((office) => (
                  <TabsTrigger key={office} value={office}>
                    {office}
                  </TabsTrigger>
                ))}
              </TabsList>
              {(hasRole('supervisor') || hasRole('manager') || hasRole('admin')) && (
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
                                    <span className="text-xs font-normal text-muted-foreground ml-2">ext {group.ext}</span>
                                  )}
                                </th>
                                <th colSpan={6} className="border-r border-b-[2px] border-gray-400 px-2 py-1 bg-muted/50">
                                  <div className="flex items-center justify-center">
                                    <button
                                      onClick={() =>
                                        handleCalendarDateChange(group.dispatcherId, addDays(startDate, -1))
                                      }
                                      className="p-0.5 hover:bg-muted rounded"
                                    >
                                      <ChevronLeft className="h-3 w-3" />
                                    </button>
                                    <div className="text-xs font-medium text-foreground mx-2">
                                      {format(startDate, "MMM dd")} - {format(addDays(startDate, 5), "MMM dd, yyyy")}
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleCalendarDateChange(group.dispatcherId, addDays(startDate, 1))
                                      }
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
                              {group.trucks.slice(0, visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT).map((truck, truckIndex) => {
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
                                      !order.order_files?.some((file: any) => file.file_category === "POD")
                                  )
                                  .sort((a, b) => {
                                    // Sort by pickup datetime ascending (earliest first)
                                    const aDate = new Date(a.pickup_datetime || '9999-12-31').getTime();
                                    const bDate = new Date(b.pickup_datetime || '9999-12-31').getTime();
                                    return aDate - bDate;
                                  })[0];
                                
                                // Extract pickup and delivery stops from pickup_drops
                                if (currentOrder && currentOrder.pickup_drops) {
                                  currentOrder.pickupStop = currentOrder.pickup_drops.find((pd: any) => pd.type === 'pickup');
                                  currentOrder.deliveryStop = currentOrder.pickup_drops.find((pd: any) => pd.type === 'delivery');
                                }
                                
                                const hasBOL =
                                  currentOrder?.order_files?.some((file: any) => file.file_category === "BOL") || false;
                                const hasPOD =
                                  currentOrder?.order_files?.some((file: any) => file.file_category === "POD") || false;
                                const pickupArrived = !!currentOrder?.pickupStop?.arrived_at;
                                
                                // Check if any HOS timer is 0 or below
                                const hasExpiredHOS = truck.driveMinutes <= 0 || truck.shiftMinutes <= 0 || 
                                                     truck.breakMinutes <= 0 || truck.cycleMinutes <= 0;

                                // Get drug test styling and check if driver is new
                                const isNew = isNewDriver(truck);
                                const canManageDrugTests = hasRole('safety') || hasRole('manager') || hasRole('admin');
                                const drugTestStyle = getDrugTestCellStyle(truck);
                                const shouldShowDrugTestUI = isNew && canManageDrugTests;

                                return (
                                  <>
                                    <tr key={truck.id} className={truckIndex % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                                      <td
                                        className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs font-medium ${shouldShowDrugTestUI ? 'cursor-pointer hover:opacity-80' : ''}`}
                                        style={{
                                          width: "77px",
                                          minWidth: "77px",
                                          maxWidth: "77px",
                                          ...drugTestStyle,
                                        }}
                                        onClick={() => {
                                          if (shouldShowDrugTestUI && truck.driverId) {
                                            setDrugTestDialog({ driverId: truck.driverId, driverName: truck.driver });
                                          }
                                        }}
                                      >
                                        <div className="flex items-center gap-1">
                                          {truck.truckNumber}
                                          {hasExpiredHOS && (
                                            <Clock className="h-3 w-3 text-destructive" />
                                          )}
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
                                        className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs ${shouldShowDrugTestUI ? 'cursor-pointer hover:opacity-80' : ''}`}
                                        style={{
                                          width: "163px",
                                          minWidth: "163px",
                                          maxWidth: "163px",
                                          ...drugTestStyle,
                                        }}
                                        onClick={() => {
                                          if (shouldShowDrugTestUI && truck.driverId) {
                                            setDrugTestDialog({ driverId: truck.driverId, driverName: truck.driver });
                                          }
                                        }}
                                      >
                                        <div className="flex items-center gap-2">
                                          {truck.driver}
                                          {(truck.driverPhone || truck.driverEmail || truck.trailerNumber) && (
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <button className="inline-flex">
                                                  <Info className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto">
                                                <div className="space-y-1">
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
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          )}
                                        </div>
                                      </td>
                                      <td
                                        className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs ${shouldShowDrugTestUI ? 'cursor-pointer hover:opacity-80' : ''}`}
                                        style={{
                                          width: "136px",
                                          minWidth: "136px",
                                          maxWidth: "136px",
                                          ...drugTestStyle,
                                        }}
                                        onClick={() => {
                                          if (shouldShowDrugTestUI && truck.driverId) {
                                            setDrugTestDialog({ driverId: truck.driverId, driverName: truck.driver });
                                          }
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
                                        className={`border-r border-b-[6px] border-gray-400 p-0 ${hasExpiredHOS ? 'bg-destructive/50' : ''}`}
                                        style={{
                                          height: "64px",
                                        }}
                                      >
                                        <div className={`h-8 border-b border-border flex items-center justify-around px-1 ${hasExpiredHOS ? 'bg-destructive/50' : ''}`}>
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
                                          onClick={() => handleGameOverClick(truck.id, truck.truckNumber)}
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
                                  </>
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
                                Load More Trucks ({group.trucks.length - (visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT)} remaining)
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
        <DialogContent className="max-w-md z-[100]">
          <DialogHeader>
            <DialogTitle>Set Truck Status - {gameOverDialog?.truckNumber}</DialogTitle>
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
                <DatePicker
                  date={gameOverStartDate}
                  onDateChange={setGameOverStartDate}
                  placeholder="Select date"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleGameOverConfirm}
                disabled={!gameOverStartDate}
                className="flex-1"
              >
                Set Status
              </Button>
              {gameOverDialog?.existingDates && gameOverDialog.existingDates.length > 0 && (
                <Button
                  onClick={handleGameOverRemove}
                  variant="destructive"
                  className="flex-1"
                >
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
                value={getDrugTestForDriver(drugTestDialog?.driverId || '')?.result || 'pending'}
                onValueChange={(value) => {
                  if (drugTestDialog?.driverId) {
                    // Find the truck ID for this driver
                    const truck = groupedReports
                      ?.flatMap(group => group.trucks)
                      .find(t => t.driverId === drugTestDialog.driverId);
                    
                    upsertDrugTest.mutate({
                      driverId: drugTestDialog.driverId,
                      result: value as 'positive' | 'negative' | 'pending',
                      truckId: truck?.id,
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
    </>
  );
};

export default Reports;
