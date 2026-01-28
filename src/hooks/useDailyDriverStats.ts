import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
async function fetchDailyStatsByDispatcher(
  startDate: string,
  endDate: string,
  office?: string
): Promise<DispatcherDailyStats[]> {
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

  // Group by dispatcher
  const dispatcherMap = new Map<string, DispatcherDailyStats>();

  (data || []).forEach((row: DailyDriverStat) => {
    if (!dispatcherMap.has(row.dispatcher_id)) {
      dispatcherMap.set(row.dispatcher_id, {
        dispatcher_id: row.dispatcher_id,
        office: row.office,
        lost_day_count: 0,
        home_time_count: 0,
        reschedule_count: 0,
      });
    }
    const stats = dispatcherMap.get(row.dispatcher_id)!;
    if (row.has_lost_day) stats.lost_day_count++;
    if (row.has_home_time) stats.home_time_count++;
    if (row.has_reschedule) stats.reschedule_count++;
  });

  return Array.from(dispatcherMap.values());
}

/**
 * Calculate live stats for today by querying orders directly
 * Lost Day = No pickup on that day AND not in-transit (picked up before, delivering after)
 */
async function calculateLiveStatsForToday(office?: string): Promise<DailyStatsSummary[]> {
  const today = getChicagoToday();

  // Step 1: Get all active drivers with their dispatcher/office info
  const { data: driversData, error: driversError } = await supabase
    .from("drivers")
    .select("id, name, dispatcher_id, is_active")
    .eq("is_active", true)
    .not("dispatcher_id", "is", null);

  if (driversError) throw driversError;

  const drivers = driversData || [];

  // Get dispatcher profiles for office info
  const dispatcherIds = [...new Set(drivers.map((d) => d.dispatcher_id).filter(Boolean))];

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

  // Step 3: Find drivers who are "working" today
  // Working = has pickup today OR is in-transit (picked up before today, delivering today or after)
  const workingDriverIds = new Set<string>();

  // Paginate through orders to find working drivers
  let offset = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: ordersBatch, error: ordersError } = await supabase
      .from("orders")
      .select("driver1_id, driver2_id, pickup_datetime, delivery_datetime")
      .eq("canceled", false)
      .range(offset, offset + batchSize - 1);

    if (ordersError) throw ordersError;

    for (const order of ordersBatch || []) {
      if (!order.pickup_datetime) continue;

      const pickupDate = order.pickup_datetime.split("T")[0];
      const deliveryDate = order.delivery_datetime?.split("T")[0];

      // Check if driver is working on today
      const hasPickupToday = pickupDate === today;
      const isInTransit = pickupDate < today && deliveryDate && deliveryDate >= today;

      if (hasPickupToday || isInTransit) {
        if (order.driver1_id) workingDriverIds.add(order.driver1_id);
        if (order.driver2_id) workingDriverIds.add(order.driver2_id);
      }
    }

    hasMore = (ordersBatch?.length || 0) === batchSize;
    offset += batchSize;
  }

  // Step 4: Calculate lost days per office
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
    const isWorking = workingDriverIds.has(driver.id);
    const hasHomeTime = homeTimeDrivers.has(driver.id);

    if (hasHomeTime) {
      stats.home_time_count++;
    } else if (!isWorking) {
      // Lost day = not working AND not on home time
      stats.lost_day_count++;
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
    queryFn: () => fetchDailyStatsByDispatcher(startDate, endDate, office),
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
