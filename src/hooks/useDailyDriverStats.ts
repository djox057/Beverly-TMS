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
 * Calculate live stats for today by querying source tables directly
 */
async function calculateLiveStatsForToday(office?: string): Promise<DailyStatsSummary[]> {
  const today = getChicagoToday();

  // Get lost_day_notes for today
  const { data: lostDayNotes, error: notesError } = await supabase
    .from("lost_day_notes")
    .select(`
      driver_id,
      note_type,
      drivers!inner(dispatcher_id)
    `)
    .eq("date", today);

  if (notesError) throw notesError;

  // Get dispatcher profiles for office info
  const dispatcherIds = [
    ...new Set(
      (lostDayNotes || [])
        .map((n: any) => n.drivers?.dispatcher_id)
        .filter(Boolean)
    ),
  ];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, office")
    .in("user_id", dispatcherIds);

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.office]));

  // Get orders with reschedules
  const { data: orders } = await supabase
    .from("orders")
    .select(`
      id,
      driver1_id,
      date_change_notes,
      delivery_datetime,
      driver1:drivers!orders_driver1_id_fkey(dispatcher_id)
    `)
    .not("date_change_notes", "is", null)
    .eq("canceled", false);

  // Get dispatcher info for rescheduled orders
  const rescheduleDispatcherIds = [
    ...new Set(
      (orders || [])
        .map((o: any) => o.driver1?.dispatcher_id)
        .filter(Boolean)
    ),
  ];

  const { data: rescheduleProfiles } = await supabase
    .from("profiles")
    .select("user_id, office")
    .in("user_id", rescheduleDispatcherIds);

  const rescheduleProfileMap = new Map(
    (rescheduleProfiles || []).map((p) => [p.user_id, p.office])
  );

  // Aggregate by office
  const officeStats = new Map<string, DailyStatsSummary>();

  // Process lost day notes
  (lostDayNotes || []).forEach((note: any) => {
    const noteOffice = profileMap.get(note.drivers?.dispatcher_id) || "Unknown";
    if (office && noteOffice !== office) return;

    if (!officeStats.has(noteOffice)) {
      officeStats.set(noteOffice, {
        date: today,
        office: noteOffice,
        lost_day_count: 0,
        home_time_count: 0,
        reschedule_count: 0,
      });
    }

    const stats = officeStats.get(noteOffice)!;
    if (note.note_type === "home_time") {
      stats.home_time_count++;
    } else {
      stats.lost_day_count++;
    }
  });

  // Process reschedules
  const countedDrivers = new Set<string>();
  
  (orders || []).forEach((order: any) => {
    if (!order.date_change_notes || !order.driver1_id || !order.delivery_datetime) return;
    if (countedDrivers.has(order.driver1_id)) return;

    const regex = /Supposed to deliver on (\d{2})\/(\d{2})\/(\d{4})/g;
    let match;
    let isRescheduledToday = false;

    while ((match = regex.exec(order.date_change_notes)) !== null) {
      const [_, month, day, year] = match;
      const origDate = `${year}-${month}-${day}`;
      const actualDate = order.delivery_datetime.split("T")[0];

      const origDateObj = new Date(origDate);
      const actualDateObj = new Date(actualDate);
      const todayObj = new Date(today);

      if (todayObj >= origDateObj && todayObj < actualDateObj) {
        isRescheduledToday = true;
        break;
      }
    }

    if (isRescheduledToday) {
      countedDrivers.add(order.driver1_id);
      const orderOffice = rescheduleProfileMap.get(order.driver1?.dispatcher_id) || "Unknown";
      if (office && orderOffice !== office) return;

      if (!officeStats.has(orderOffice)) {
        officeStats.set(orderOffice, {
          date: today,
          office: orderOffice,
          lost_day_count: 0,
          home_time_count: 0,
          reschedule_count: 0,
        });
      }
      officeStats.get(orderOffice)!.reschedule_count++;
    }
  });

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
