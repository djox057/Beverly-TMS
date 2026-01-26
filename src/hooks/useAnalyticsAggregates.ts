import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useEffect } from "react";

export interface DispatcherAnalytics {
  id: string;
  dispatcher_id: string;
  dispatcher_name: string;
  office: string | null;
  period_type: string;
  period_start: string;
  period_end: string;
  total_freight: number;
  total_driver_rate: number;
  dispatcher_cut: number;
  dispatcher_cut_percent: number;
  total_miles: number;
  rate_per_mile: number;
  order_count: number;
  avg_trucks: number;
  last_calculated_at: string;
}

export interface PeriodTotals {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  office: string | null;
  total_freight: number;
  total_driver_rate: number;
  total_cut: number;
  total_cut_percent: number;
  total_miles: number;
  rate_per_mile: number;
  order_count: number;
  last_calculated_at: string;
}

interface UseAnalyticsAggregatesOptions {
  periodType: "week" | "month";
  periodStart?: Date;
  office?: string | null;
  enabled?: boolean;
}

// Helper to get Monday of week
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useAnalyticsAggregates(options: UseAnalyticsAggregatesOptions) {
  const { periodType, periodStart, office, enabled = true } = options;
  const queryClient = useQueryClient();

  // Calculate period bounds
  const effectivePeriodStart = periodStart 
    ? (periodType === "week" ? getWeekStart(periodStart) : startOfMonth(periodStart))
    : (periodType === "week" ? getWeekStart(new Date()) : startOfMonth(new Date()));

  const periodStartStr = format(effectivePeriodStart, "yyyy-MM-dd");

  // Fetch dispatcher analytics
  const dispatcherQuery = useQuery({
    queryKey: ["analytics-dispatchers", periodType, periodStartStr, office],
    queryFn: async () => {
      console.log(`[useAnalyticsAggregates] Fetching dispatcher analytics for ${periodType} starting ${periodStartStr}`);
      
      let query = supabase
        .from("analytics_dispatcher_period")
        .select("*")
        .eq("period_type", periodType)
        .eq("period_start", periodStartStr);

      if (office) {
        query = query.eq("office", office);
      }

      const { data, error } = await query.order("total_freight", { ascending: false });

      if (error) {
        console.error("[useAnalyticsAggregates] Error fetching dispatcher analytics:", error);
        throw error;
      }

      console.log(`[useAnalyticsAggregates] Fetched ${data?.length || 0} dispatcher records`);
      return (data || []) as DispatcherAnalytics[];
    },
    enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch period totals
  const totalsQuery = useQuery({
    queryKey: ["analytics-totals", periodType, periodStartStr, office],
    queryFn: async () => {
      console.log(`[useAnalyticsAggregates] Fetching period totals for ${periodType} starting ${periodStartStr}`);
      
      let query = supabase
        .from("analytics_period_totals")
        .select("*")
        .eq("period_type", periodType)
        .eq("period_start", periodStartStr);

      // If office filter, get that office's totals; otherwise get global (office = null)
      if (office) {
        query = query.eq("office", office);
      } else {
        query = query.is("office", null);
      }

      // FIX: Use .order().limit(1) instead of .maybeSingle() to handle potential duplicates gracefully
      const { data, error } = await query
        .order("last_calculated_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("[useAnalyticsAggregates] Error fetching period totals:", error);
        throw error;
      }

      const result = (data && data.length > 0) ? data[0] : null;
      console.log(`[useAnalyticsAggregates] Fetched totals:`, result);
      return result as PeriodTotals | null;
    },
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Trigger calculation if data is stale or missing
  useEffect(() => {
    const triggerCalculation = async () => {
      if (!enabled) return;
      
      // Check if we have recent data
      const totals = totalsQuery.data;
      const lastCalc = totals?.last_calculated_at;
      
      // If no data or data is older than 5 minutes, trigger recalculation
      const isStale = !lastCalc || (Date.now() - new Date(lastCalc).getTime()) > 5 * 60 * 1000;
      
      if (isStale && !dispatcherQuery.isLoading && !totalsQuery.isLoading) {
        console.log("[useAnalyticsAggregates] Data is stale, triggering calculation...");
        
        try {
          const { error } = await supabase.functions.invoke("calculate-analytics", {
            body: {
              period_type: periodType,
              period_start: periodStartStr,
              force_recalc: false
            }
          });

          if (error) {
            console.error("[useAnalyticsAggregates] Failed to trigger calculation:", error);
            return;
          }

          // Invalidate queries to refetch
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["analytics-dispatchers"] });
            queryClient.invalidateQueries({ queryKey: ["analytics-totals"] });
          }, 2000);
        } catch (err) {
          console.error("[useAnalyticsAggregates] Error triggering calculation:", err);
        }
      }
    };

    triggerCalculation();
  }, [enabled, periodType, periodStartStr, totalsQuery.data, dispatcherQuery.isLoading, totalsQuery.isLoading, queryClient]);

  // Force recalculation
  const recalculate = async () => {
    console.log("[useAnalyticsAggregates] Force recalculating...");
    
    const { error } = await supabase.functions.invoke("calculate-analytics", {
      body: {
        period_type: periodType,
        period_start: periodStartStr,
        force_recalc: true
      }
    });

    if (error) {
      console.error("[useAnalyticsAggregates] Recalculation failed:", error);
      throw error;
    }

    // Refetch after calculation
    await new Promise(resolve => setTimeout(resolve, 2000));
    queryClient.invalidateQueries({ queryKey: ["analytics-dispatchers"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-totals"] });
  };

  return {
    dispatchers: dispatcherQuery.data || [],
    totals: totalsQuery.data,
    isLoading: dispatcherQuery.isLoading || totalsQuery.isLoading,
    error: dispatcherQuery.error || totalsQuery.error,
    recalculate,
    lastCalculatedAt: totalsQuery.data?.last_calculated_at,
  };
}

// Hook for fetching multiple periods (for month/week comparisons)
export function useAnalyticsMultiplePeriods(
  periodType: "week" | "month",
  periods: Date[],
  enabled = true
) {
  return useQuery({
    queryKey: ["analytics-multiple-periods", periodType, periods.map(p => format(p, "yyyy-MM-dd"))],
    queryFn: async () => {
      const periodStarts = periods.map(p => 
        format(periodType === "week" ? getWeekStart(p) : startOfMonth(p), "yyyy-MM-dd")
      );

      const { data, error } = await supabase
        .from("analytics_dispatcher_period")
        .select("*")
        .eq("period_type", periodType)
        .in("period_start", periodStarts)
        .order("total_freight", { ascending: false });

      if (error) throw error;
      return (data || []) as DispatcherAnalytics[];
    },
    enabled: enabled && periods.length > 0,
    staleTime: 60 * 1000,
  });
}
