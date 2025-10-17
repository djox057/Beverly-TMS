import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X, ChevronLeft, ChevronRight, Info, Clock, Maximize2, Skull } from "lucide-react";
import gameOverIcon from "@/assets/game-over-icon.png";
import { useNavigate } from "react-router-dom";
import { HosCircularTimer } from "@/components/HosCircularTimer";
import { useReports } from "@/hooks/useReports";
import { useSamsaraLocations } from "@/hooks/useSamsaraLocations";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo, memo, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/components/ui/sidebar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCarousel } from "@/components/ui/calendar-carousel";
import { startOfWeek, addDays, isSameDay, format } from "date-fns";
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
  const { profile } = useAuthContext();
  const navigate = useNavigate();

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
  const [gameOverEndDate, setGameOverEndDate] = useState<Date | undefined>(undefined);
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
        return "bg-[hsl(var(--cell-transit))] text-[hsl(var(--cell-transit-foreground))] border-border";
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

      // If this is the block day, render black GAME/OVER cell
      if (isBlockDay) {
        const isToday = isSameDay(day, new Date());
        return (
          <td
            key={index}
            className={`border ${isToday ? "border-primary border-2" : "border-gray-200"} p-0 w-[12%] ${isFirstTruck ? "" : "border-t-0"}`}
            style={{
              minWidth: "120px",
              maxWidth: "120px",
              width: "120px",
              height: "64px",
            }}
          >
            {/* Top half - "GAME" */}
            <div
              className="border-b border-gray-200 flex flex-col items-center justify-center bg-black"
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              <div className="text-sm font-bold text-white">GAME</div>
            </div>

            {/* Bottom half - "OVER" */}
            <div
              className="flex flex-col items-center justify-center bg-black"
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              <div className="text-sm font-bold text-white">OVER</div>
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

      // Check if this is a missing pickup (red XXX) - empty pickup cell after first pickup
      const isEmptyPickup = pickupOnlyOrders.length === 0 && sameDayOrders.length === 0;
      const isAfterFirstPickup = firstPickupDate && day >= firstPickupDate;
      const isWithinTimeframe = day <= oneDayInFuture;
      const isMissingPickup = isEmptyPickup && isAfterFirstPickup && isWithinTimeframe && !isInTransit;

      // Check if this day is today
      const isToday = isSameDay(day, new Date());
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
              className={`border-b ${!isToday && index > 0 ? 'border-l' : ''} ${!isToday ? 'border-r' : ''} border-gray-400 flex flex-col ${isToday ? 'px-[2%]' : ''} ${deliveryOnlyOrders.length > 0 ? "" : isInTransit ? "bg-[hsl(var(--cell-loading))]" : "bg-muted"}`}
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
                                      {deliveryOrder.loadDetails.documents.length > 0
                                        ? deliveryOrder.loadDetails.documents.map((doc) => doc.category).join(", ")
                                        : "None"}
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
                  className={`text-xs h-full flex items-center justify-center ${isInTransit ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                >
                  {isInTransit ? ">>>" : "—"}
                </div>
              )}
            </div>

            {/* Pickup cell (bottom half) - includes same-day orders */}
            <div
              className={`${!isToday && index > 0 ? 'border-l' : ''} ${!isToday ? 'border-r' : ''} border-gray-400 flex flex-col ${isToday ? 'px-[2%]' : ''} ${pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? "" : isMissingPickup ? "bg-[hsl(0_72%_53%)] dark:bg-[hsl(var(--destructive-light))]" : isInTransit ? "bg-[hsl(var(--cell-loading))]" : "bg-muted"}`}
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
                                      {pickupOrder.loadDetails.documents.length > 0
                                        ? pickupOrder.loadDetails.documents.map((doc) => doc.category).join(", ")
                                        : "None"}
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
                                  {order.loadDetails.documents.length > 0
                                    ? order.loadDetails.documents.map((doc) => doc.category).join(", ")
                                    : "None"}
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
      return groupedReports.filter((group) => group.office === office);
    };
  }, [groupedReports]);
  
  // Only get filtered reports for the active tab
  const activeOfficeReports = useMemo(() => {
    return filterReportsByOffice(activeTab);
  }, [activeTab, filterReportsByOffice]);

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
      ?.filter((note: any) => note.note.toLowerCase() === "game over")
      .map((note: any) => note.date) || [];
    
    setGameOverDialog({
      truckId,
      truckNumber,
      existingDates: existingGameOverDates,
    });
    setGameOverStartDate(undefined);
    setGameOverEndDate(undefined);
  };

  const handleGameOverConfirm = async () => {
    if (!gameOverDialog || !gameOverStartDate) {
      toast({
        title: "Select a date",
        description: "Please select at least a start date.",
        variant: "destructive",
      });
      return;
    }

    try {
      const dates: Date[] = [];
      const start = new Date(gameOverStartDate);
      const end = gameOverEndDate ? new Date(gameOverEndDate) : start;
      
      // Generate all dates in range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
      }

      // Add "game over" for each date
      for (const date of dates) {
        const dateStr = format(date, "yyyy-MM-dd");
        await updateLostDayNote.mutateAsync({
          truckId: gameOverDialog.truckId,
          date: dateStr,
          note: "game over",
        });
      }

      toast({
        title: "Game over set",
        description: `Set game over for ${dates.length} day(s) on truck ${gameOverDialog.truckNumber}`,
      });

      setGameOverDialog(null);
      setGameOverStartDate(undefined);
      setGameOverEndDate(undefined);
    } catch (error) {
      toast({
        title: "Failed to set game over",
        description: "There was an error setting game over status.",
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
      setGameOverEndDate(undefined);
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
      <div className="h-full bg-background overflow-hidden flex flex-col">
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-4 pt-2 sticky top-0 bg-background z-10 border-b border-border">
            <TabsList className="grid w-full grid-cols-4 mb-2">
              {offices.map((office) => (
                <TabsTrigger key={office} value={office}>
                  {office}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Only render the active tab content */}
          <TabsContent value={activeTab} className="mt-0">
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
                              <tr className="bg-muted/50">
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
                              <tr className="bg-muted/50">
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
                                  const isToday = isSameDay(day, new Date());
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

                                // Get current order to determine BOL/POD status for routing (exclude GAME-OVER blocks)
                                const currentOrder = truck.allOrders?.find(
                                  (order) =>
                                    order.notes !== "GAME|OVER" &&
                                    !order.order_files?.some((file: any) => file.file_category === "POD"),
                                );
                                const hasBOL =
                                  currentOrder?.order_files?.some((file: any) => file.file_category === "BOL") || false;
                                const hasPOD =
                                  currentOrder?.order_files?.some((file: any) => file.file_category === "POD") || false;
                                const pickupArrived = !!currentOrder?.pickupStop?.arrived_at;
                                
                                // Check if any HOS timer is 0 or below
                                const hasExpiredHOS = truck.driveMinutes <= 0 || truck.shiftMinutes <= 0 || 
                                                     truck.breakMinutes <= 0 || truck.cycleMinutes <= 0;

                                return (
                                  <>
                                    <tr key={truck.id} className={truckIndex % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                                      <td
                                        className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs text-foreground font-medium`}
                                        style={{
                                          width: "77px",
                                          minWidth: "77px",
                                          maxWidth: "77px",
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
                                        className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs text-foreground`}
                                        style={{
                                          width: "163px",
                                          minWidth: "163px",
                                          maxWidth: "163px",
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
                                        className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs text-foreground`}
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
                                        className={`border-b-[6px] border-gray-400 px-2 py-1 text-[10px] text-muted-foreground relative`}
                                        style={{
                                          width: "80px",
                                          minWidth: "80px",
                                          maxWidth: "80px",
                                        }}
                                      >
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="absolute top-0 right-0 h-4 w-4 p-0 hover:bg-background/20 z-10"
                                          onClick={() => handleGameOverClick(truck.id, truck.truckNumber)}
                                        >
                                          <img src={gameOverIcon} alt="Game Over" className="h-3 w-3" />
                                        </Button>
                                        {truck.lastEdit}
                                      </td>
                                      <td
                                        className={`border-b-[6px] border-gray-400 px-2 py-1 text-[10px] text-muted-foreground ${sidebarOpen ? "border-r border-border" : ""}`}
                                        style={{
                                          width: "80px",
                                          minWidth: "80px",
                                          maxWidth: "80px",
                                        }}
                                      >
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
            <DialogTitle>Game Over - Truck {gameOverDialog?.truckNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {gameOverDialog?.existingDates && gameOverDialog.existingDates.length > 0 && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm font-medium mb-2">Current Game Over Dates:</p>
                <div className="text-xs space-y-1">
                  {gameOverDialog.existingDates.map((date) => (
                    <div key={date}>{format(new Date(date), "MMM dd, yyyy")}</div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <DatePicker
                  date={gameOverStartDate}
                  onDateChange={setGameOverStartDate}
                  placeholder="Select start date"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">End Date (Optional - for range)</label>
                <DatePicker
                  date={gameOverEndDate}
                  onDateChange={setGameOverEndDate}
                  placeholder="Select end date (optional)"
                  disabled={!gameOverStartDate}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleGameOverConfirm}
                disabled={!gameOverStartDate}
                className="flex-1"
              >
                Set Game Over
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
    </>
  );
};

export default Reports;
