import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { jitteredInterval } from "@/lib/utils";

export const useRecoveryTrucks = () => {
  const refetchInterval = useMemo(() => jitteredInterval(60000), []);
  return useQuery({
    queryKey: ["recovery-trucks"],
    queryFn: async () => {
      // Stage 1: Flat trucks fetch (no joins)
      const { data: trucks, error } = await supabase
        .from("trucks")
        .select("*")
        .eq("needs_recovery", true)
        .order("truck_number");

      if (error) throw error;
      if (!trucks || trucks.length === 0) return [];

      // Stage 2: Collect unique IDs
      const driverIds = [...new Set(trucks.flatMap(t => [t.driver1_id, t.left_by_driver_id, t.dispatcher_id].filter(Boolean)))] as string[];
      const companyIds = [...new Set(trucks.map(t => t.company_id).filter(Boolean))] as string[];
      const trailerIds = [...new Set(trucks.map(t => t.trailer_id).filter(Boolean))] as string[];
      const truckIds = trucks.map(t => t.id);

      // Stage 3: Parallel batch fetches
      const [driversRes, companiesRes, trailersRes, lostDayNotesRes, ordersRes] = await Promise.all([
        driverIds.length > 0
          ? supabase.from("drivers").select("id, name, is_recovery, company_id").in("id", driverIds)
          : { data: [] },
        companyIds.length > 0
          ? supabase.from("companies").select("id, name").in("id", companyIds)
          : { data: [] },
        trailerIds.length > 0
          ? supabase.from("trailers").select("id, trailer_number").in("id", trailerIds)
          : { data: [] },
        driverIds.length > 0
          ? supabase.from("lost_day_notes").select("*").in("driver_id", driverIds)
          : { data: [] },
        supabase.from("orders").select("*").in("truck_id", truckIds).order("pickup_datetime"),
      ]);

      // Fetch pickup_drops for orders
      const orderIds = (ordersRes.data || []).map(o => o.id);
      const pickupDropsRes = orderIds.length > 0
        ? await supabase.from("pickup_drops").select("*").in("order_id", orderIds)
        : { data: [] };

      // Fetch company names for drivers
      const driverCompanyIds = [...new Set((driversRes.data || []).map(d => d.company_id).filter(Boolean))] as string[];
      const driverCompaniesRes = driverCompanyIds.length > 0
        ? await supabase.from("companies").select("id, name").in("id", driverCompanyIds)
        : { data: [] };

      // Build lookup maps
      const driverMap = new Map((driversRes.data || []).map(d => [d.id, d]));
      const companyMap = new Map([...(companiesRes.data || []), ...(driverCompaniesRes.data || [])].map(c => [c.id, c]));
      const trailerMap = new Map((trailersRes.data || []).map(t => [t.id, t]));
      const lostDayNotes = lostDayNotesRes.data || [];

      // Build pickup_drops by order_id
      const pickupDropsByOrderId = new Map<string, any[]>();
      for (const pd of (pickupDropsRes.data || [])) {
        const arr = pickupDropsByOrderId.get(pd.order_id) || [];
        arr.push(pd);
        pickupDropsByOrderId.set(pd.order_id, arr);
      }

      // Attach pickup_drops to orders
      const ordersWithDrops = (ordersRes.data || []).map(o => ({
        ...o,
        pickup_drops: pickupDropsByOrderId.get(o.id) || [],
      }));

      // Stage 4: Assemble
      return trucks.map((truck) => {
        const truckOrders = ordersWithDrops.filter(o => o.truck_id === truck.id);
        const lastLoad = truckOrders[truckOrders.length - 1];

        const driverId = truck.driver1_id || truck.left_by_driver_id;
        const truckLostDayNotes = lostDayNotes.filter(n => n.driver_id === driverId);

        const gameOverNote = truckLostDayNotes.find((note: any) =>
          note.note?.toLowerCase().includes("game over")
        );

        const driver = driverMap.get(truck.driver1_id);
        const driverWithCompany = driver ? {
          ...driver,
          company: companyMap.get(driver.company_id) || null,
        } : null;

        return {
          ...truck,
          companyName: companyMap.get(truck.company_id)?.name,
          trailerNumber: trailerMap.get(truck.trailer_id)?.trailer_number,
          currentDriver: driverWithCompany,
          leftByDriver: driverMap.get(truck.left_by_driver_id) || null,
          dispatcherName: driverMap.get(truck.dispatcher_id)?.name || "Unassigned",
          lastLoad,
          activeOrders: truckOrders,
          enteredRecoveryDate: gameOverNote?.date,
        };
      });
    },
    staleTime: 30000,
    refetchInterval,
    retry: 1,
  });
};
