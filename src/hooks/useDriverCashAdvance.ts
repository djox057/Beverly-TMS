import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Get Chicago time boundaries
function getChicagoTodayStart(): Date {
  const now = new Date();
  const chicagoNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  chicagoNow.setHours(0, 0, 0, 0);
  return chicagoNow;
}

function getChicagoWeekStart(): Date {
  const now = new Date();
  const chicagoNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dayOfWeek = chicagoNow.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days since Monday
  chicagoNow.setDate(chicagoNow.getDate() - diff);
  chicagoNow.setHours(0, 0, 0, 0);
  return chicagoNow;
}

export function useDriverCashAdvance(driverId: string | null) {
  return useQuery({
    queryKey: ["driver-cash-advances", driverId],
    queryFn: async () => {
      if (!driverId) {
        return { todayCount: 0, weekCount: 0, weeklyAmount: 0, canRequest: true };
      }

      const todayStart = getChicagoTodayStart();
      const weekStart = getChicagoWeekStart();

      // Fetch today's advances
      const { data: todayAdvances, error: todayError } = await supabase
        .from("driver_cash_advances")
        .select("id")
        .eq("driver_id", driverId)
        .gte("requested_at", todayStart.toISOString());

      if (todayError) {
        console.error("Error fetching today's advances:", todayError);
        throw todayError;
      }

      // Fetch this week's advances with amounts
      const { data: weekAdvances, error: weekError } = await supabase
        .from("driver_cash_advances")
        .select("id, amount")
        .eq("driver_id", driverId)
        .gte("requested_at", weekStart.toISOString());

      if (weekError) {
        console.error("Error fetching week's advances:", weekError);
        throw weekError;
      }

      const todayCount = todayAdvances?.length || 0;
      const weekCount = weekAdvances?.length || 0;
      const weeklyAmount = weekAdvances?.reduce((sum, adv) => sum + (adv.amount || 0), 0) || 0;
      const remainingAmount = 150 - weeklyAmount;
      const canRequest = todayCount < 1 && weekCount < 3 && remainingAmount > 0;

      return { todayCount, weekCount, weeklyAmount, remainingAmount, canRequest };
    },
    enabled: !!driverId,
    staleTime: 30000, // 30 seconds
  });
}
