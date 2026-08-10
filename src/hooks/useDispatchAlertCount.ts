import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getOilChangeThresholds } from "@/pages/Reports/helpers";
import { useAuthContext } from "@/contexts/AuthContext";

const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const isExpiring = (date: string | null, now: Date) => {
  if (!date) return false;
  return new Date(date).getTime() <= now.getTime() + TWO_MONTHS_MS;
};

const needsAttention = (date: string | null, now: Date) => {
  if (!date) return false;
  return new Date(date).getTime() <= now.getTime() + ONE_MONTH_MS;
};

/**
 * Counts how many trucks, trailers, and drivers under the current dispatch
 * user have something that needs attention in the Alerts page (expiries,
 * maintenance, or oil change due). Scoping matches the Alerts page: trucks
 * whose driver1 is assigned to this dispatcher, their trailers, and their
 * drivers. Only runs for dispatch / afterhours roles.
 */
export const useDispatchAlertCount = () => {
  const { user, getPrimaryRole } = useAuthContext();
  const role = getPrimaryRole();
  const isDispatch = role === "dispatch" || role === "afterhours";

  return useQuery({
    queryKey: ["dispatch-alert-count", user?.id],
    enabled: !!user?.id && isDispatch,
    queryFn: async () => {
      const uid = user!.id;
      const now = new Date();

      // Drivers whose dispatcher is this user
      const { data: myDrivers } = await supabase
        .from("drivers")
        .select("*")
        .eq("is_active", true)
        .eq("dispatcher_id", uid);

      const myDriverIds = new Set<string>((myDrivers || []).map((d) => d.id));

      // Trucks whose driver1 is one of my drivers (driver1 is the dispatcher source)
      const trucksQuery =
        myDriverIds.size > 0
          ? await supabase
              .from("trucks")
              .select("*")
              .eq("is_active", true)
              .in("driver1_id", [...myDriverIds])
          : { data: [] as any[], error: null };
      const myTrucks = trucksQuery.data || [];

      // Trailers of my trucks + driver2 members of my team
      const myTrailerIds = new Set<string>();
      for (const t of myTrucks) {
        if (t.trailer_id) myTrailerIds.add(t.trailer_id);
        if (t.driver2_id) myDriverIds.add(t.driver2_id);
      }

      // Count trucks with alerts (same rules as the Alerts page)
      const trucksWithAlert = myTrucks.filter(
        (truck) =>
          isExpiring(truck.dot_inspection_date, now) ||
          isExpiring(truck.plate_expiration_date, now) ||
          isExpiring(truck.insurance_expiration_date, now) ||
          needsAttention(truck.tires_swap_date, now) ||
          needsAttention(truck.maintenance_check_date, now),
      ).length;

      // Count trailers with alerts
      let trailersWithAlert = 0;
      if (myTrailerIds.size > 0) {
        const { data: trailers } = await supabase
          .from("trailers")
          .select("*")
          .eq("is_active", true)
          .in("id", [...myTrailerIds]);
        trailersWithAlert = (trailers || []).filter(
          (t) =>
            isExpiring(t.dot_inspection_date, now) ||
            isExpiring(t.plate_expiration_date, now) ||
            isExpiring(t.insurance_expiration_date, now),
        ).length;
      }

      // Count drivers with alerts
      const driversWithAlert = (myDrivers || []).filter(
        (d) =>
          isExpiring(d.cdl_expiration_date, now) ||
          isExpiring(d.mvr_date, now) ||
          isExpiring(d.clearing_house, now) ||
          isExpiring(d.medical_card_expiration_date, now) ||
          isExpiring(d.random_drug_test_date, now),
      ).length;

      return trucksWithAlert + trailersWithAlert + driversWithAlert;
    },
    staleTime: 120000,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
};
