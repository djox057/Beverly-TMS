import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isValidUUID } from "@/utils/validation";

export interface DailyDriverStat {
  id: string;
  date: string;
  driver_id: string;
  dispatcher_id: string;
  office: string;
  has_lost_day: boolean;
  has_home_time: boolean;
  has_reschedule: boolean;
  lost_day_note: string | null;
  reschedule_order_id: string | null;
  recorded_at: string;
}

export interface DailyStatsSummary {
  date: string;
  office: string;
  lost_day_count: number;
  home_time_count: number;
  reschedule_count: number;
}

export interface DispatcherDailyStats {
  dispatcher_id: string;
  office: string;
  lost_day_count: number;
  home_time_count: number;
  reschedule_count: number;
}

interface Order {
  id: string;
  driver1_id: string | null;
  driver2_id: string | null;
  pickup_datetime: string | null;
  delivery_datetime: string | null;
  original_delivery_datetime: string | null;
  date_change_notes: string | null;
  canceled: boolean;
}

/**
 * Get Chicago timezone date string (YYYY-MM-DD)
 */
function getChicagoToday(): string {
  const chicago = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [month, day, year] = chicago.split("/");
  return `${year}-${month}-${day}`;
}

function subtractDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T12:00:00Z");
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

function parseRescheduledOriginalDate(notes: string): string | null {
  // LEGACY FALLBACK: Parse "Supposed to deliver on MM/DD/YYYY" from date_change_notes
  const regex = /Supposed to deliver on (\d{2})\/(\d{2})\/(\d{4})/;
  const match = notes.match(regex);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * WALKBACK ALGORITHM: Determines if a date is a lost day for a driver
 */
function isLostDayWalkback(orders: Order[], targetDate: string): boolean {
  // Step 1: Check if driver has a pickup on targetDate
  const hasPickupToday = orders.some(order => {
    if (!order.pickup_datetime) return false;
    const pickupDate = order.pickup_datetime.split("T")[0];
    return pickupDate === targetDate;
  });

  if (hasPickupToday) {
    return false; // Has pickup today → NOT a lost day
  }

  // Step 2: Walk backwards to find most recent pickup before targetDate
  for (let daysBack = 1; daysBack <= 30; daysBack++) {
    const checkDate = subtractDays(targetDate, daysBack);
    
    const orderOnDate = orders.find(order => {
      if (!order.pickup_datetime) return false;
      const pickupDate = order.pickup_datetime.split("T")[0];
      return pickupDate === checkDate;
    });

    if (orderOnDate) {
      if (!orderOnDate.delivery_datetime) {
        return true; // No delivery date → treat as lost day
      }

      const deliveryDate = orderOnDate.delivery_datetime.split("T")[0];
      
      if (deliveryDate > targetDate) {
        return false; // Still in transit
      } else {
        return true; // Load complete, is a lost day
      }
    }
  }

  return true; // No pickup found in 30 days → IS a lost day
}

/**
 * RESCHEDULE DETECTION: Check if targetDate falls in a reschedule lost day range
 * Uses original_delivery_datetime (structured) with fallback to regex parsing.
 */
function isRescheduleLostDay(orders: Order[], targetDate: string): boolean {
  // Check if driver has ANY pickup on targetDate - if so, not a reschedule lost day
  const hasPickupToday = orders.some(order => {
    if (!order.pickup_datetime) return false;
    const pickupDate = order.pickup_datetime.split("T")[0];
    return pickupDate === targetDate;
  });

  if (hasPickupToday) {
    return false;
  }

  for (const order of orders) {
    // Get original delivery date:
    // 1. Prefer structured column (original_delivery_datetime)
    // 2. Fallback to regex parsing for legacy records
    let originalDate: string | null = null;
    
    if (order.original_delivery_datetime) {
      originalDate = order.original_delivery_datetime.split("T")[0];
    } else if (order.date_change_notes) {
      originalDate = parseRescheduledOriginalDate(order.date_change_notes);
    }
    
    if (!originalDate) continue;
    
    if (!order.delivery_datetime) continue;
    const actualDate = order.delivery_datetime.split("T")[0];
    
    // Check if actualDate > originalDate (was actually rescheduled later)
    if (actualDate <= originalDate) continue;
    
    // Check if targetDate falls within the reschedule range [originalDate, actualDate] inclusive
    if (targetDate >= originalDate && targetDate <= actualDate) {
      return true;
    }
  }
  
  return false;
}

/**
 * Fetch daily driver stats for a date range, grouped by office
 */
async function fetchDailyStatsByOffice(
  startDate: string,
  endDate: string,
  office?: string
): Promise<DailyStatsSummary[]> {
  let query = supabase
    .from("daily_driver_stats")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate);

  if (office) {
    query = query.eq("office", office);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Group by date and office
  const groupedMap = new Map<string, DailyStatsSummary>();

  (data || []).forEach((row: DailyDriverStat) => {
    const key = `${row.date}-${row.office}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        date: row.date,
        office: row.office,
        lost_day_count: 0,
        home_time_count: 0,
        reschedule_count: 0,
      });
    }
    const stats = groupedMap.get(key)!;
    if (row.has_lost_day) stats.lost_day_count++;
    if (row.has_home_time) stats.home_time_count++;
    if (row.has_reschedule) stats.reschedule_count++;
  });

  return Array.from(groupedMap.values());
}

/**
 * Fetch daily driver stats grouped by dispatcher
 */
async function fetchEmptyDaysByDispatcher(
  startDate: string,
  endDate: string,
  office?: string
): Promise<DispatcherDailyStats[]> {
  const { data, error } = await supabase.rpc(
    'calculate_empty_days_by_dispatcher' as any,
    {
      p_start_date: startDate,
      p_end_date: endDate,
      p_office: office || null,
    }
  );

  if (error) throw error;

  return (data || []).map((row: any) => ({
    dispatcher_id: row.dispatcher_id,
    office: row.office,
    lost_day_count: Number(row.empty_day_count),
    home_time_count: 0,
    reschedule_count: 0,
  }));
}

/**
 * Calculate live stats for today using WALKBACK algorithm
 * Includes both driver1_id and driver2_id for team driver support
 */
async function calculateLiveStatsForToday(office?: string): Promise<DailyStatsSummary[]> {
  const today = getChicagoToday();
  const lookbackDate = subtractDays(today, 30);

  // Step 1: Get all active drivers with their dispatcher/office info
  const { data: driversData, error: driversError } = await supabase
    .from("drivers")
    .select("id, name, dispatcher_id, is_active")
    .eq("is_active", true)
    .not("dispatcher_id", "is", null);

  if (driversError) throw driversError;

  const drivers = driversData || [];

  // Get dispatcher profiles for office info
  const dispatcherIds = [...new Set(drivers.map((d) => d.dispatcher_id).filter((id): id is string => Boolean(id) && isValidUUID(id)))];

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("user_id, office")
    .in("user_id", dispatcherIds);

  const profileMap = new Map((profilesData || []).map((p) => [p.user_id, p.office]));

  // Step 2: Get home_time notes for today
  const { data: homeTimeNotes } = await supabase
    .from("lost_day_notes")
    .select("driver_id, note_type")
    .eq("date", today)
    .eq("note_type", "home_time");

  const homeTimeDrivers = new Set((homeTimeNotes || []).map((n) => n.driver_id));

  // Step 3: Fetch all orders from last 30 days - include BOTH driver1_id and driver2_id
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("id, driver1_id, driver2_id, pickup_datetime, delivery_datetime, original_delivery_datetime, date_change_notes, canceled")
    .eq("canceled", false)
    .gte("pickup_datetime", lookbackDate + "T00:00:00")
    .order("pickup_datetime", { ascending: false });

  if (ordersError) throw ordersError;

  const orders = (ordersData || []) as Order[];

  // Group orders by driver (BOTH driver1 and driver2)
  const ordersByDriver = new Map<string, Order[]>();
  for (const order of orders) {
    // Add to driver1's list
    if (order.driver1_id) {
      if (!ordersByDriver.has(order.driver1_id)) {
        ordersByDriver.set(order.driver1_id, []);
      }
      ordersByDriver.get(order.driver1_id)!.push(order);
    }
    // Also add to driver2's list (team driver)
    if (order.driver2_id) {
      if (!ordersByDriver.has(order.driver2_id)) {
        ordersByDriver.set(order.driver2_id, []);
      }
      ordersByDriver.get(order.driver2_id)!.push(order);
    }
  }

  // Step 4: Calculate stats per office using walkback algorithm
  const officeStats = new Map<string, DailyStatsSummary>();

  for (const driver of drivers) {
    const driverOffice = profileMap.get(driver.dispatcher_id) || "Unknown";
    if (office && driverOffice !== office) continue;

    if (!officeStats.has(driverOffice)) {
      officeStats.set(driverOffice, {
        date: today,
        office: driverOffice,
        lost_day_count: 0,
        home_time_count: 0,
        reschedule_count: 0,
      });
    }

    const stats = officeStats.get(driverOffice)!;
    const driverOrders = ordersByDriver.get(driver.id) || [];
    const hasHomeTime = homeTimeDrivers.has(driver.id);

    if (hasHomeTime) {
      stats.home_time_count++;
      // Home time takes precedence - driver is NOT counted as lost day
    } else {
      // Use walkback algorithm
      const isLostDay = isLostDayWalkback(driverOrders, today);
      // Check for reschedule
      const hasReschedule = isRescheduleLostDay(driverOrders, today);
      
      // Combined: lost if walkback says lost OR reschedule says lost
      if (isLostDay || hasReschedule) {
        stats.lost_day_count++;
      }
      
      if (hasReschedule) {
        stats.reschedule_count++;
      }
    }
  }

  return Array.from(officeStats.values());
}

/**
 * Hook to get daily driver stats for a date range
 * For today, calculates live stats from source tables
 * For past dates, queries the snapshot table
 */
export const useDailyDriverStats = (
  startDate: string,
  endDate: string,
  office?: string
) => {
  const today = getChicagoToday();
  const includestoday = startDate <= today && endDate >= today;

  return useQuery({
    queryKey: ["daily-driver-stats", startDate, endDate, office],
    queryFn: async () => {
      // If the range includes today, we need to combine snapshot data with live calculation
      if (includestoday) {
        // Get past days from snapshot
        const pastEndDate = new Date(today);
        pastEndDate.setDate(pastEndDate.getDate() - 1);
        const pastEndStr = pastEndDate.toISOString().split("T")[0];

        const [snapshotStats, liveStats] = await Promise.all([
          startDate <= pastEndStr
            ? fetchDailyStatsByOffice(startDate, pastEndStr, office)
            : Promise.resolve([]),
          calculateLiveStatsForToday(office),
        ]);

        return [...snapshotStats, ...liveStats];
      }

      // All past dates - use snapshot only
      return fetchDailyStatsByOffice(startDate, endDate, office);
    },
    staleTime: includestoday ? 30000 : Infinity, // Refresh every 30s if includes today
  });
};

/**
 * Hook to get stats grouped by dispatcher for Analytics page
 */
export const useDailyDriverStatsByDispatcher = (
  startDate: string,
  endDate: string,
  office?: string
) => {
  return useQuery({
    queryKey: ["daily-driver-stats-by-dispatcher", startDate, endDate, office],
    queryFn: () => fetchEmptyDaysByDispatcher(startDate, endDate, office),
    staleTime: 60000,
  });
};

/**
 * Trigger the edge function to record stats for a specific date (or backfill)
 */
export async function triggerRecordDailyStats(options?: {
  date?: string;
  backfill?: boolean;
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (options?.date) params.set("date", options.date);
  if (options?.backfill) params.set("backfill", "true");
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);

  const { data, error } = await supabase.functions.invoke(
    "record-daily-driver-stats",
    {
      body: {},
      method: "GET",
    }
  );

  if (error) throw error;
  return data;
}
