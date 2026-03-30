import { format, isSameDay, addDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { parseSimpleDateTime } from "@/utils/dateUtils";

const CHICAGO_TZ = "America/Chicago";

/**
 * Parses a datetime string as a NAIVE datetime (ignoring any timezone info).
 * The database stores Chicago wall-time values with +00 offset, so we strip the offset
 * and treat the date/time parts as the intended Chicago wall-time.
 */
const toNaiveDate = (datetimeStr: string): Date | null => {
  if (!datetimeStr || datetimeStr === "—") return null;

  try {
    const parsed = parseSimpleDateTime(datetimeStr);
    const date = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes, 0);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
};

// Helper function to get company-based background color for truck cells
export const getCompanyBackgroundColor = (companyName: string | null) => {
  if (!companyName) return {};
  const normalizedName = companyName.toUpperCase();
  if (normalizedName.includes("BEVERLY FREIGHT")) {
    return {
      backgroundColor: "hsl(var(--company-beverly-freight))",
      color: "hsl(var(--company-beverly-freight-foreground))",
    };
  } else if (normalizedName.includes("BF PRIME UNITED")) {
    return {
      backgroundColor: "hsl(var(--company-bf-prime-united))",
      color: "hsl(var(--company-bf-prime-united-foreground))",
    };
  } else if (normalizedName.includes("BF PRIME")) {
    return {
      backgroundColor: "hsl(var(--company-bf-prime))",
      color: "hsl(var(--company-bf-prime-foreground))",
    };
  } else if (normalizedName.includes("BEVERLY GROUP")) {
    return {
      backgroundColor: "hsl(var(--company-beverly-group))",
      color: "hsl(var(--company-beverly-group-foreground))",
    };
  } else if (normalizedName.includes("BG PRIME")) {
    return {
      backgroundColor: "hsl(var(--company-bg-prime))",
      color: "hsl(var(--company-bg-prime-foreground))",
    };
  } else if (normalizedName.includes("UNITED ENTERPRISE")) {
    return {
      backgroundColor: "hsl(var(--company-united-enterprise))",
      color: "hsl(var(--company-united-enterprise-foreground))",
    };
  } else if (normalizedName.includes("AP SILVER")) {
    return {
      backgroundColor: "hsl(var(--company-ap-silver))",
      color: "hsl(var(--company-ap-silver-foreground))",
    };
  }
  return {};
};

// Helper to get current date in Chicago timezone
export const getChicagoToday = () => {
  const now = new Date();
  const chicagoTime = toZonedTime(now, CHICAGO_TZ);
  chicagoTime.setHours(0, 0, 0, 0);
  return chicagoTime;
};

// Helper to format documents in order: RC, BOL, POD, Additional (max 1 per category)
export const formatDocuments = (documents: Array<{ category: string }>) => {
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

// Helper to format datetime - treats stored values as naive Chicago wall-time
export const formatDateTime = (datetimeStr: string, formatStr: string) => {
  const date = toNaiveDate(datetimeStr);
  if (!date) return "—";
  return format(date, formatStr);
};

// Helper to format time only - treats stored values as naive Chicago wall-time
export const formatTime = (datetimeStr: string) => {
  const date = toNaiveDate(datetimeStr);
  if (!date) return "—";
  return format(date, "HH:mm");
};

// Helper to format time range (or single time if start equals end)
export const formatTimeRange = (datetimeStr: string, endDatetimeStr: string | null | undefined) => {
  const start = toNaiveDate(datetimeStr);
  if (!start) return "—";

  const startTimeFormatted = format(start, "HH:mm");

  if (!endDatetimeStr || endDatetimeStr === "—") return startTimeFormatted;

  const end = toNaiveDate(endDatetimeStr);
  if (!end) return startTimeFormatted;

  const endTimeFormatted = format(end, "HH:mm");

  if (startTimeFormatted === endTimeFormatted) return startTimeFormatted;

  return `${startTimeFormatted}-${endTimeFormatted}`;
};

// Helper function to check if 5 seconds have passed since button click
export const has5SecondsPassed = (timestamp: string | null | undefined): boolean => {
  if (!timestamp) return false;
  const clickTime = new Date(timestamp).getTime();
  const now = new Date().getTime();
  return now - clickTime >= 5000;
};

// Helper to check if any previous orders are missing POD (delivery not completed)
export const hasPreviousOrdersWithoutPOD = (truck: any | null, currentOrder: any): boolean => {
  if (!truck || !truck.allOrders || !currentOrder) return false;

  return truck.allOrders.some((order: any) => {
    if (order.id === currentOrder.id) return false;
    if (order.notes === "GAME|OVER") return false;

    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");

    return hasBOL && !hasPOD;
  });
};

// Helper to determine if we should show Going to Pickup button
export const shouldShowGoingToPickup = (order: any, stop: any, truck: any | null = null): boolean => {
  const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
  const goingToPickupClicked = !!stop.going_to_at;
  const hasIncompleteDeliveries = hasPreviousOrdersWithoutPOD(truck, order);

  if (hasIncompleteDeliveries) return false;
  return !hasBOL && !goingToPickupClicked;
};

// Helper to determine if we should show At Pickup button
export const shouldShowAtPickup = (order: any, stop: any, truck: any | null = null): boolean => {
  if (stop.arrived_at) return false;

  const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
  const goingToPickupClicked = !!stop.going_to_at;
  const fiveSecondsPassed = has5SecondsPassed(stop.going_to_at);
  const hasIncompleteDeliveries = hasPreviousOrdersWithoutPOD(truck, order);

  if (hasIncompleteDeliveries) return false;
  return goingToPickupClicked && fiveSecondsPassed && !hasBOL;
};

// Helper to determine if we should show Going to Delivery button
export const shouldShowGoingToDelivery = (order: any, stop: any, _truck: any | null = null): boolean => {
  const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
  const goingToDeliveryClicked = !!stop.going_to_at;

  if (goingToDeliveryClicked) return false;
  return hasBOL;
};

// Helper to determine if we should show At Delivery button
export const shouldShowAtDelivery = (order: any, stop: any, _truck: any | null = null): boolean => {
  if (stop.arrived_at) return false;

  const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
  const goingToDeliveryClicked = !!stop.going_to_at;
  const fiveSecondsPassed = has5SecondsPassed(stop.going_to_at);

  return (hasBOL || goingToDeliveryClicked) && fiveSecondsPassed;
};

// Helper to check if a date string matches today (no timezone conversion)
const isDateToday = (dateStr: string | null | undefined): boolean => {
  if (!dateStr) return false;
  // Extract just the date part (YYYY-MM-DD) from the datetime string
  const datePart = dateStr.substring(0, 10);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return datePart === todayStr;
};

// Helper to get pickup cell color based on status and previous load
export const getPickupCellColor = (order: any, previousLoadDeliveryComplete: boolean, latePickups?: Set<string>, stop?: any) => {
  // Show destructive styling for canceled orders only if pickup date is today
  if (order.canceled && isDateToday(order.pickup_datetime)) {
    return "bg-destructive/80 text-destructive-foreground border-destructive/50";
  }

  if (order.is_recovery) return "bg-purple-500/80 text-white border-purple-500/50";

  const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
  const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
  const hasArrived = stop?.arrived_at ?? order.pickupStop?.arrived_at;
  const isLate = latePickups?.has(order.id);

  // For multi-pickup loads: BOL should only turn the corresponding pickup green
  const pickupStops =
    order.pickupStops ||
    order.pickup_drops
      ?.filter((pd: any) => pd.type === "pickup")
      .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)) ||
    [];
  const bolCount = order.order_files?.filter((file: any) => file.file_category === "BOL").length || 0;

  if (pickupStops.length > 1 && stop) {
    const stopIndex = pickupStops.findIndex((s: any) => s.id === stop.id);
    if (bolCount > stopIndex) {
      return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
    }
  } else {
    if (hasBOL || hasPOD) return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
  }

  // Arrived at pickup overrides late status - if arrived, show blue not orange
  if (hasArrived) return "bg-[hsl(var(--cell-active))] text-[hsl(var(--cell-active-foreground))] border-border";
  // Only show late (orange) if NOT arrived
  if (isLate) return "bg-[hsl(var(--cell-late))] text-[hsl(var(--cell-late-foreground))] border-border";
  if (previousLoadDeliveryComplete) return "bg-[#00FFFF] text-black border-border";
  return "bg-[hsl(var(--cell-pending))] text-[hsl(var(--cell-pending-foreground))] border-border";
};

// Helper to get delivery cell color based on status
export const getDeliveryCellColor = (order: any, stop: any | undefined, lateDeliveries: Set<string>) => {
  // Show destructive styling for canceled orders only if pickup date is today
  if (order.canceled && isDateToday(order.pickup_datetime)) {
    return "bg-destructive/80 text-destructive-foreground border-destructive/50";
  }

  if (order.is_recovery) return "bg-purple-500/80 text-white border-purple-500/50";

  const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
  const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
  const hasArrived = stop?.arrived_at;
  const isLate = lateDeliveries.has(order.id);

  const deliveryStops =
    order.deliveryStops ||
    order.pickup_drops
      ?.filter((pd: any) => pd.type === "delivery")
      .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)) ||
    [];

  const podCount = order.order_files?.filter((file: any) => file.file_category === "POD").length || 0;

  if (deliveryStops.length > 1 && stop) {
    const stopIndex = deliveryStops.findIndex((s: any) => s.id === stop.id);
    if (podCount > stopIndex) {
      return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
    }
  } else {
    if (hasPOD) return "bg-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete-foreground))] border-border";
  }

  // Arrived at delivery overrides late status - if arrived, show blue not orange
  if (hasBOL && hasArrived) return "bg-[hsl(var(--cell-active))] text-[hsl(var(--cell-active-foreground))] border-border";
  // Only show late (orange) if NOT arrived
  if (isLate) return "bg-[hsl(var(--cell-late))] text-[hsl(var(--cell-late-foreground))] border-border";
  if (hasBOL) return "bg-[hsl(var(--cell-lime))] text-[hsl(var(--cell-lime-foreground))] border-border";
  return "bg-[hsl(var(--cell-pending))] text-[hsl(var(--cell-pending-foreground))] border-border";
};

// Helper function to get lost day note for a specific date
export const getLostDayNote = (truck: any, date: Date): string => {
  const dateStr = format(date, "yyyy-MM-dd");
  // Check both snake_case and camelCase versions for compatibility with legacy and date-window adapter
  const allLostDayNotes: any[] = (truck.lost_day_notes ?? truck.lostDayNotes ?? []) as any[];
  // NOTE: Some code paths may provide `date` as an ISO timestamp string; always normalize to YYYY-MM-DD.
  const lostDayNote = allLostDayNotes.find((note: any) => String(note?.date || "").slice(0, 10) === dateStr);

  if (!lostDayNote) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const oneDayFuture = addDays(today, 1);
    if (isSameDay(checkDate, oneDayFuture)) {
      return "No pre-book 🥺?";
    }
    if (isSameDay(checkDate, today)) {
      return "Empty";
    }
    return "Lost day";
  }

  if (lostDayNote.note_type === "home_time") {
    return "Home Time";
  }

  return lostDayNote.note || "Lost day";
};

// Type for game over check result
export type GameOverType = "yard" | "at_road";

// Helper function to check if a date has "game over" note
export const isGameOverDay = (truck: any, date: Date): { isGameOver: boolean; type: GameOverType | null } => {
  const dateStr = format(date, "yyyy-MM-dd");
  // Check both snake_case and camelCase versions for compatibility
  const allLostDayNotes: any[] = (truck.lost_day_notes ?? truck.lostDayNotes ?? []) as any[];
  // NOTE: Some code paths may provide `date` as an ISO timestamp string; always normalize to YYYY-MM-DD.
  const lostDayNote = allLostDayNotes.find((note: any) => String(note?.date || "").slice(0, 10) === dateStr);
  const note = lostDayNote?.note?.toLowerCase();

  if (note === "game over - yard") return { isGameOver: true, type: "yard" };
  if (note === "game over - at road") return { isGameOver: true, type: "at_road" };
  return { isGameOver: false, type: null };
};

// Helper function to check if pickup and delivery are on the same date
export const isSameDayPickupDelivery = (order: any) => {
  return order.pickupDate && order.deliveryDate && isSameDay(order.pickupDate, order.deliveryDate);
};

// Parse orders with dates for calendar rendering
export const parseOrdersWithDates = (truck: any) => {
  return (
    truck.allOrders
      ?.map((order: any) => {
        const pickupDate = order.pickup_datetime ? toNaiveDate(order.pickup_datetime) : null;
        const deliveryDate = order.delivery_datetime ? toNaiveDate(order.delivery_datetime) : null;

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
      .sort((a: any, b: any) => {
        if (!a.pickupDate && !b.pickupDate) return 0;
        if (!a.pickupDate) return 1;
        if (!b.pickupDate) return -1;
        return a.pickupDate.getTime() - b.pickupDate.getTime();
      }) || []
  );
};

// Get previous load delivery status
export const getPreviousLoadDeliveryStatus = (ordersWithDates: any[], currentOrder: any): boolean => {
  const currentIndex = ordersWithDates.findIndex((o) => o.id === currentOrder.id);
  if (currentIndex <= 0) return true;

  const previousOrder = ordersWithDates[currentIndex - 1];
  const hasPOD = previousOrder.order_files?.some((file: any) => file.file_category === "POD");
  return !!hasPOD;
};

// Status colors helper
export const getStatusColors = (status: string) => {
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

// Helper to get maintenance icon status for trucks
export const getMaintenanceIconStatus = (truck: any): { show: boolean; color: string; tooltip: string } => {
  const dates = [
    { name: "Oil Change", date: truck.oil_change_date },
    { name: "Tires Swap", date: truck.tires_swap_date },
    { name: "Maintenance Check", date: truck.maintenance_check_date },
  ];
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  let minDays = Infinity;
  const dueSoon: string[] = [];
  
  for (const { name, date } of dates) {
    if (!date) continue;
    const maintenanceDate = new Date(date);
    maintenanceDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((maintenanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil <= 30) {
      minDays = Math.min(minDays, daysUntil);
      dueSoon.push(`${name}: ${daysUntil <= 0 ? 'Overdue' : `${daysUntil} days left`}`);
    }
  }
  
  if (dueSoon.length === 0) {
    return { show: false, color: "", tooltip: "" };
  }
  
  const color = minDays <= 7 ? "red" : "yellow";
  return { show: true, color, tooltip: dueSoon.join(", ") };
};

// Helper to check if a delivery stop time is >= 16:00 (late delivery)
export const isLateDeliveryTime = (datetimeStr: string): boolean => {
  if (!datetimeStr || datetimeStr === "—") return false;
  const timeStr = formatDateTime(datetimeStr, "HH");
  if (timeStr === "—") return false;
  return parseInt(timeStr, 10) >= 16;
};

// Helper to get DOT inspection icon status for trucks and trailers
export const getDotInspectionIconStatus = (truck: any): { show: boolean; color: 'red' | 'yellow' | null; tooltip: string } => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const dates = [
    { name: "Truck DOT", date: truck.dot_inspection_date },
    { name: "Trailer DOT", date: truck.trailer_dot_inspection_date },
  ];
  
  let minDays = Infinity;
  const dueSoon: string[] = [];
  
  for (const { name, date } of dates) {
    if (!date) continue;
    const dotDate = new Date(date);
    dotDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((dotDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // 2 months = ~60 days
    if (daysUntil <= 60) {
      minDays = Math.min(minDays, daysUntil);
      dueSoon.push(`${name}: ${daysUntil <= 0 ? 'Expired' : `${daysUntil} days left`}`);
    }
  }
  
  if (dueSoon.length === 0) {
    return { show: false, color: null, tooltip: "" };
  }
  
  // Red if 30 days or less, yellow if 31-60 days
  const color: 'red' | 'yellow' = minDays <= 30 ? "red" : "yellow";
  return { show: true, color, tooltip: dueSoon.join(", ") };
};

// Haversine distance in miles with 1.3 road correction factor
export const haversineDistanceMiles = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.3; // Apply road correction factor
};

// Get the next stop in the multi-stop / multi-order sequence for a truck
// Sequence: P1 → P2 → D1 → D2 → next_order.P1
// Returns { latitude, longitude, nextOrderDhMiles } or null
export const getNextStopInSequence = (
  currentStopId: string,
  currentOrder: any,
  allSortedOrders: any[]
): { latitude: number; longitude: number; nextOrderDhMiles: number } | null => {
  // Build stop sequence for current order: all pickups then all deliveries
  const pickupStops = (
    currentOrder.pickupStops ||
    currentOrder.pickup_drops?.filter((pd: any) => pd.type === "pickup")
      .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)) ||
    (currentOrder.pickupStop ? [currentOrder.pickupStop] : [])
  );
  const deliveryStops = (
    currentOrder.deliveryStops ||
    currentOrder.pickup_drops?.filter((pd: any) => pd.type === "delivery")
      .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)) ||
    (currentOrder.deliveryStop ? [currentOrder.deliveryStop] : [])
  );

  const sequence = [...pickupStops, ...deliveryStops];
  const currentIndex = sequence.findIndex((s: any) => s.id === currentStopId);

  // If found in sequence and there's a next stop in the same order
  if (currentIndex >= 0 && currentIndex < sequence.length - 1) {
    const nextStop = sequence[currentIndex + 1];
    if (nextStop.latitude && nextStop.longitude) {
      return {
        latitude: nextStop.latitude,
        longitude: nextStop.longitude,
        nextOrderDhMiles: currentOrder.deadhead_miles || currentOrder.dh_miles || 0,
      };
    }
  }

  // Otherwise look at the next order's first pickup
  const currentOrderIndex = allSortedOrders.findIndex((o: any) => o.id === currentOrder.id);
  if (currentOrderIndex >= 0 && currentOrderIndex < allSortedOrders.length - 1) {
    const nextOrder = allSortedOrders[currentOrderIndex + 1];
    const nextPickupStops = (
      nextOrder.pickupStops ||
      nextOrder.pickup_drops?.filter((pd: any) => pd.type === "pickup")
        .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)) ||
      (nextOrder.pickupStop ? [nextOrder.pickupStop] : [])
    );
    const firstPickup = nextPickupStops[0];
    if (firstPickup?.latitude && firstPickup?.longitude) {
      return {
        latitude: firstPickup.latitude,
        longitude: firstPickup.longitude,
        nextOrderDhMiles: nextOrder.deadhead_miles || nextOrder.dh_miles || 0,
      };
    }
  }

  return null;
};
