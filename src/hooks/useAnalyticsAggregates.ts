import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;
const MAX_ITERATIONS = 50;

export interface AggregatedEntity {
  totalFreight: number;
  totalDriverPay: number;
  totalDriverPayEffective: number;
  totalMiles: number;
  totalDhMiles: number;
  orderCount: number;
  isCompanyDriver: boolean;
  entityName: string;
}

export interface DailyRow {
  entity_id: string;
  entity_name: string | null;
  date: string;
  total_freight: number | null;
  total_driver_pay: number | null;
  total_driver_pay_effective: number | null;
  total_miles: number | null;
  total_dh_miles: number | null;
  order_count: number | null;
  is_company_driver: boolean | null;
}

/**
 * Paginated fetch from analytics_locked_daily. Returns all matching rows.
 */
async function fetchAllRows(
  entityType: string,
  dateType: string,
  startDate?: string,
  endDate?: string
): Promise<DailyRow[]> {
  const allRows: DailyRow[] = [];
  let lastId = "00000000-0000-0000-0000-000000000000";
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    let query = supabase
      .from("analytics_locked_daily")
      .select("id, entity_id, entity_name, date, total_freight, total_driver_pay, total_driver_pay_effective, total_miles, total_dh_miles, order_count, is_company_driver")
      .eq("entity_type", entityType)
      .eq("date_type", dateType)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (startDate) query = query.gte("date", startDate);
    if (endDate) query = query.lte("date", endDate);

    const { data, error } = await query;

    if (error) {
      console.error("[useAnalyticsAggregates] Fetch error:", error);
      throw error;
    }

    if (!data || data.length === 0) break;

    allRows.push(...(data as DailyRow[]));
    lastId = (data[data.length - 1] as any).id;
    iteration++;

    if (data.length < PAGE_SIZE) break;
  }

  if (iteration >= MAX_ITERATIONS) {
    console.warn(`[useAnalyticsAggregates] Hit pagination safety cap (${MAX_ITERATIONS} iterations, ${allRows.length} rows)`);
  }

  return allRows;
}

/**
 * Groups daily rows by entity_id into summed aggregates.
 */
function groupByEntity(rows: DailyRow[]): Record<string, AggregatedEntity> {
  const result: Record<string, AggregatedEntity> = {};

  for (const row of rows) {
    const existing = result[row.entity_id];
    if (existing) {
      existing.totalFreight += Number(row.total_freight) || 0;
      existing.totalDriverPay += Number(row.total_driver_pay) || 0;
      existing.totalDriverPayEffective += Number(row.total_driver_pay_effective) || 0;
      existing.totalMiles += Number(row.total_miles) || 0;
      existing.totalDhMiles += Number(row.total_dh_miles) || 0;
      existing.orderCount += Number(row.order_count) || 0;
    } else {
      result[row.entity_id] = {
        totalFreight: Number(row.total_freight) || 0,
        totalDriverPay: Number(row.total_driver_pay) || 0,
        totalDriverPayEffective: Number(row.total_driver_pay_effective) || 0,
        totalMiles: Number(row.total_miles) || 0,
        totalDhMiles: Number(row.total_dh_miles) || 0,
        orderCount: Number(row.order_count) || 0,
        isCompanyDriver: row.is_company_driver === true,
        entityName: row.entity_name || "Unknown",
      };
    }
  }

  return result;
}

/**
 * Date-filtered aggregates grouped by entity_id.
 * Used for dispatcher performance, driver analytics, totals row.
 */
export function useAnalyticsAggregates(
  entityType: "dispatcher" | "driver",
  dateType: "pickup" | "delivery",
  startDate?: string,
  endDate?: string,
  enabled = true
) {
  // Allow fetching without date filters (for "All Time" view)
  const hasDateFilter = !!startDate && !!endDate;
  return useQuery({
    queryKey: ["analytics-aggregates", entityType, dateType, startDate ?? "all", endDate ?? "all"],
    queryFn: async () => {
      console.log(`[useAnalyticsAggregates] Fetching ${entityType}/${dateType} ${startDate ?? "all"}-${endDate ?? "all"}`);
      const rows = await fetchAllRows(entityType, dateType, hasDateFilter ? startDate : undefined, hasDateFilter ? endDate : undefined);
      const grouped = groupByEntity(rows);
      console.log(`[useAnalyticsAggregates] ${entityType}/${dateType}: ${rows.length} rows -> ${Object.keys(grouped).length} entities`);
      return grouped;
    },
    enabled,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * All-time aggregated (grouped by entity_id) — used for all-time tiers.
 * Returns SUM(total_freight) and MIN(date) per entity.
 */
export function useAnalyticsAggregatesAllTime(
  entityType: "dispatcher" | "driver",
  dateType: "pickup" | "delivery",
  enabled = true
) {
  return useQuery({
    queryKey: ["analytics-aggregates-alltime", entityType, dateType],
    queryFn: async () => {
      console.log(`[useAnalyticsAggregates] Fetching all-time ${entityType}/${dateType}`);
      const rows = await fetchAllRows(entityType, dateType);

      // Group by entity_id: SUM freight, MIN date
      const result: Record<string, { totalGross: number; firstDate: string | null }> = {};
      for (const row of rows) {
        const existing = result[row.entity_id];
        if (existing) {
          existing.totalGross += Number(row.total_freight) || 0;
          if (row.date && (!existing.firstDate || row.date < existing.firstDate)) {
            existing.firstDate = row.date;
          }
        } else {
          result[row.entity_id] = {
            totalGross: Number(row.total_freight) || 0,
            firstDate: row.date || null,
          };
        }
      }

      // Also return entity_name mapping for driver name resolution
      const entityNames: Record<string, string> = {};
      for (const row of rows) {
        if (row.entity_name && !entityNames[row.entity_id]) {
          entityNames[row.entity_id] = row.entity_name;
        }
      }

      console.log(`[useAnalyticsAggregates] All-time ${entityType}/${dateType}: ${rows.length} rows -> ${Object.keys(result).length} entities`);
      return { aggregates: result, entityNames };
    },
    enabled,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * All-time daily rows (NOT grouped) — used for gross rankings weekly bucketing.
 * Returns raw daily rows for client-side weekly bucketing.
 */
export function useAnalyticsAggregatesDailyRows(
  entityType: "dispatcher" | "driver",
  dateType: "pickup" | "delivery",
  enabled = true
) {
  return useQuery({
    queryKey: ["analytics-aggregates-alltime-daily", entityType, dateType],
    queryFn: async () => {
      console.log(`[useAnalyticsAggregates] Fetching all-time daily rows ${entityType}/${dateType}`);
      const rows = await fetchAllRows(entityType, dateType);
      console.log(`[useAnalyticsAggregates] All-time daily ${entityType}/${dateType}: ${rows.length} rows`);
      return rows;
    },
    enabled,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
