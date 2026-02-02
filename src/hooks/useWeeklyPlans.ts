import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const CHICAGO_TZ = "America/Chicago";

interface WeeklyPlan {
  id: string;
  driver_id: string;
  week_start: string;
  plan_text: string;
  updated_at: string;
}

/**
 * Get Chicago time now
 */
function getChicagoNow(): Date {
  return toZonedTime(new Date(), CHICAGO_TZ);
}

/**
 * Get the Monday of the current week in Chicago time
 */
function getCurrentWeekMonday(): string {
  const chicagoNow = getChicagoNow();
  const monday = startOfWeek(chicagoNow, { weekStartsOn: 1 }); // 1 = Monday
  return format(monday, "yyyy-MM-dd");
}

/**
 * Get icon color based on plan state and time
 * - Yellow: No plan before 11 AM Monday
 * - Red: No plan after 1 PM Monday
 * - Gray: Has plan (all good)
 */
export function getWeeklyPlanIconColor(hasPlan: boolean): "yellow" | "red" | "gray" {
  const chicagoNow = getChicagoNow();
  const dayOfWeek = chicagoNow.getDay();
  const hours = chicagoNow.getHours();
  const totalMinutes = hours * 60 + chicagoNow.getMinutes();
  
  // After 1:00 PM Monday (780 minutes)
  const isAfterDeadline = dayOfWeek === 1 && totalMinutes >= 13 * 60;
  const isPastMonday = dayOfWeek > 1 || dayOfWeek === 0; // Tue-Sun

  if (hasPlan) {
    return "gray"; // Has plan - all good
  }

  if (isAfterDeadline || isPastMonday) {
    return "red"; // No plan after deadline
  }

  return "yellow"; // No plan before deadline
}

/**
 * Hook for managing weekly plans for drivers
 */
export function useWeeklyPlans(driverIds: string[]) {
  const [plans, setPlans] = useState<Map<string, WeeklyPlan>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const weekStart = useMemo(() => getCurrentWeekMonday(), []);

  // Fetch plans for all drivers
  const fetchPlans = useCallback(async () => {
    if (driverIds.length === 0) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("weekly_plans")
        .select("*")
        .in("driver_id", driverIds)
        .eq("week_start", weekStart);

      if (error) throw error;

      const plansMap = new Map<string, WeeklyPlan>();
      data?.forEach((plan) => {
        plansMap.set(plan.driver_id, plan as WeeklyPlan);
      });
      setPlans(plansMap);
    } catch (error) {
      console.error("Error fetching weekly plans:", error);
    } finally {
      setIsLoading(false);
    }
  }, [driverIds, weekStart]);

  // Initial fetch
  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Set up realtime subscription
  useEffect(() => {
    if (driverIds.length === 0) return;

    const channel = supabase
      .channel("weekly-plans-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "weekly_plans",
        },
        (payload) => {
          const data = (payload.new || payload.old) as WeeklyPlan;
          if (!data || data.week_start !== weekStart) return;
          if (!driverIds.includes(data.driver_id)) return;

          setPlans((prev) => {
            const newPlans = new Map(prev);
            if (payload.eventType === "DELETE") {
              newPlans.delete(data.driver_id);
            } else {
              newPlans.set(data.driver_id, payload.new as WeeklyPlan);
            }
            return newPlans;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverIds, weekStart]);

  // Helper to check if a driver has a plan
  const hasPlan = useCallback(
    (driverId: string): boolean => {
      const plan = plans.get(driverId);
      return !!plan && plan.plan_text.trim().length > 0;
    },
    [plans]
  );

  // Helper to get plan text for a driver
  const getPlanText = useCallback(
    (driverId: string): string => {
      return plans.get(driverId)?.plan_text || "";
    },
    [plans]
  );

  return {
    plans,
    isLoading,
    hasPlan,
    getPlanText,
    refetch: fetchPlans,
  };
}
