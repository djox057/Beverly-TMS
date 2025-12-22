import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Get Chicago time boundaries as UTC ISO strings for database queries
function getChicagoTodayStartUTC(): string {
  const now = new Date();
  // Get Chicago's current offset in milliseconds
  const chicagoOffset = getChicagoOffset(now);
  // Calculate what time it is in Chicago right now
  const chicagoNow = new Date(now.getTime() + chicagoOffset);
  // Set to midnight Chicago time
  chicagoNow.setUTCHours(0, 0, 0, 0);
  // Convert back to UTC by subtracting the offset
  const utcMidnight = new Date(chicagoNow.getTime() - chicagoOffset);
  return utcMidnight.toISOString();
}

function getChicagoWeekStartUTC(): string {
  const now = new Date();
  // Get Chicago's current offset in milliseconds
  const chicagoOffset = getChicagoOffset(now);
  const chicagoNow = new Date(now.getTime() + chicagoOffset);
  // Get day of week (0 = Sunday)
  const dayOfWeek = chicagoNow.getUTCDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days since Monday
  chicagoNow.setUTCDate(chicagoNow.getUTCDate() - diff);
  chicagoNow.setUTCHours(0, 0, 0, 0);
  const utcMonday = new Date(chicagoNow.getTime() - chicagoOffset);
  return utcMonday.toISOString();
}

// Get Chicago timezone offset in minutes (negative for behind UTC)
function getChicagoOffset(date: Date): number {
  // Create formatter to get Chicago time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
  
  const chicagoDate = new Date(Date.UTC(
    getPart('year'), getPart('month') - 1, getPart('day'),
    getPart('hour'), getPart('minute'), getPart('second')
  ));
  
  return chicagoDate.getTime() - date.getTime();
}

export function useDriverCashAdvance(driverId: string | null) {
  return useQuery({
    queryKey: ["driver-cash-advances", driverId],
    queryFn: async () => {
      if (!driverId) {
        return { todayCount: 0, weekCount: 0, weeklyAmount: 0, canRequest: true };
      }

      const todayStart = getChicagoTodayStartUTC();
      const weekStart = getChicagoWeekStartUTC();

      // Fetch today's advances
      const { data: todayAdvances, error: todayError } = await supabase
        .from("driver_cash_advances")
        .select("id")
        .eq("driver_id", driverId)
        .gte("requested_at", todayStart);

      if (todayError) {
        console.error("Error fetching today's advances:", todayError);
        throw todayError;
      }

      // Fetch this week's advances with amounts
      const { data: weekAdvances, error: weekError } = await supabase
        .from("driver_cash_advances")
        .select("id, amount")
        .eq("driver_id", driverId)
        .gte("requested_at", weekStart);

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
