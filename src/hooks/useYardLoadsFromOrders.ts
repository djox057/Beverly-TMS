import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Terminal coordinates (Lynwood, IL yard location)
const TERMINAL_LAT = 41.537855;
const TERMINAL_LON = -87.578633;

function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.15);
}

export interface YardLoadOrder {
  id: string;
  internalLoadNumber: number | null;
  trailerNumber: string | null;
  trailerId: string | null;
  deliveryDate: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  pickupDate: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  truckNumber: string | null;
  driverName: string | null;
  brokerName: string | null;
  brokerLoadNumber: string | null;
  notes: string | null;
  mileage: number | null;
  terminalToDeliveryMiles: number | null;
  driverPrice: number | null;
  freightAmount: number | null;
  companyName: string | null;
  bookedBy: string | null;
  status: string | null;
  locked: boolean;
  canceled: boolean;
  isRecovery: boolean;
  truckId: string | null;
  driver1Id: string | null;
  originalDriverId: string | null;
  originalDriver2Id: string | null;
  originalDriverName: string | null;
  originalTruckId: string | null;
  originalTruckNumber: string | null;
  originalTrailerId: string | null;
  originalTrailerNumber: string | null;
  originalMiles: number | null;
  originalDriverPrice: number | null;
  recoveryMiles: number | null;
  recoveryDriverPrice: number | null;
}

export const useYardLoadsFromOrders = () => {
  return useQuery({
    queryKey: ["yard-loads-orders"],
    queryFn: async () => {
      // Stage 1: Flat orders fetch (no joins)
      const { data: orders, error } = await supabase
        .from("orders")
        .select(`
          id, internal_load_number, broker_load_number, notes, mileage,
          driver_price, freight_amount, booked_by, status, locked, canceled,
          is_recovery, truck_id, driver1_id, trailer_id, broker_id, company_id,
          pickup_datetime, delivery_datetime,
          original_driver1_id, original_driver2_id, original_truck_id,
          original_trailer_id, original_miles, original_driver_price,
          recovery_miles, recovery_driver_price
        `)
        .is("driver1_id", null)
        .is("truck_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!orders || orders.length === 0) return [];

      // Stage 2: Collect unique IDs
      const orderIds = orders.map(o => o.id);
      const trailerIds = [...new Set(orders.map(o => o.trailer_id).filter(Boolean))] as string[];
      const brokerIds = [...new Set(orders.map(o => o.broker_id).filter(Boolean))] as string[];
      const companyIds = [...new Set(orders.map(o => o.company_id).filter(Boolean))] as string[];
      const origDriverIds = [...new Set(orders.map(o => o.original_driver1_id).filter(Boolean))] as string[];
      const origTruckIds = [...new Set(orders.map(o => o.original_truck_id).filter(Boolean))] as string[];
      const origTrailerIds = [...new Set(orders.map(o => o.original_trailer_id).filter(Boolean))] as string[];

      // Stage 3: Parallel batch fetches
      const [trailersRes, brokersRes, companiesRes, origDriversRes, origTrucksRes, origTrailersRes, pickupDropsRes] = await Promise.all([
        trailerIds.length > 0 ? supabase.from("trailers").select("id, trailer_number").in("id", trailerIds) : { data: [] },
        brokerIds.length > 0 ? supabase.from("brokers").select("id, name").in("id", brokerIds) : { data: [] },
        companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : { data: [] },
        origDriverIds.length > 0 ? supabase.from("drivers").select("id, name").in("id", origDriverIds) : { data: [] },
        origTruckIds.length > 0 ? supabase.from("trucks").select("id, truck_number").in("id", origTruckIds) : { data: [] },
        origTrailerIds.length > 0 ? supabase.from("trailers").select("id, trailer_number").in("id", origTrailerIds) : { data: [] },
        supabase.from("pickup_drops").select("id, order_id, type, city, state, datetime, sequence_number, latitude, longitude").in("order_id", orderIds),
      ]);

      // Build lookup maps
      const trailerMap = new Map((trailersRes.data || []).map(t => [t.id, t]));
      const brokerMap = new Map((brokersRes.data || []).map(b => [b.id, b]));
      const companyMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
      const origDriverMap = new Map((origDriversRes.data || []).map(d => [d.id, d]));
      const origTruckMap = new Map((origTrucksRes.data || []).map(t => [t.id, t]));
      const origTrailerMap = new Map((origTrailersRes.data || []).map(t => [t.id, t]));

      const pickupDropsByOrder = new Map<string, any[]>();
      for (const pd of (pickupDropsRes.data || [])) {
        const arr = pickupDropsByOrder.get(pd.order_id) || [];
        arr.push(pd);
        pickupDropsByOrder.set(pd.order_id, arr);
      }

      // Stage 4: Assemble
      return orders.map((order) => {
        const drops = pickupDropsByOrder.get(order.id) || [];
        const pickups = drops.filter(pd => pd.type === 'pickup').sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
        const deliveries = drops.filter(pd => pd.type === 'delivery').sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));

        const firstPickup = pickups[0];
        const lastDelivery = deliveries[deliveries.length - 1];

        let terminalToDeliveryMiles: number | null = null;
        if (lastDelivery?.latitude && lastDelivery?.longitude) {
          terminalToDeliveryMiles = calculateDistanceMiles(TERMINAL_LAT, TERMINAL_LON, lastDelivery.latitude, lastDelivery.longitude);
        }

        return {
          id: order.id,
          internalLoadNumber: order.internal_load_number,
          trailerNumber: trailerMap.get(order.trailer_id)?.trailer_number || null,
          trailerId: order.trailer_id || null,
          deliveryDate: lastDelivery?.datetime || order.delivery_datetime || null,
          deliveryCity: lastDelivery?.city || null,
          deliveryState: lastDelivery?.state || null,
          pickupDate: order.pickup_datetime || firstPickup?.datetime || null,
          pickupCity: firstPickup?.city || null,
          pickupState: firstPickup?.state || null,
          truckNumber: null,
          driverName: null,
          brokerName: brokerMap.get(order.broker_id)?.name || null,
          brokerLoadNumber: order.broker_load_number || null,
          notes: order.notes || null,
          mileage: order.mileage || 0,
          terminalToDeliveryMiles,
          driverPrice: order.driver_price || 0,
          freightAmount: order.freight_amount || 0,
          companyName: companyMap.get(order.company_id)?.name || null,
          bookedBy: order.booked_by || null,
          status: order.status || 'pending',
          locked: order.locked || false,
          canceled: order.canceled || false,
          isRecovery: order.is_recovery || false,
          truckId: order.truck_id,
          driver1Id: order.driver1_id,
          originalDriverId: order.original_driver1_id || null,
          originalDriver2Id: order.original_driver2_id || null,
          originalDriverName: origDriverMap.get(order.original_driver1_id)?.name || null,
          originalTruckId: order.original_truck_id || null,
          originalTruckNumber: origTruckMap.get(order.original_truck_id)?.truck_number || null,
          originalTrailerId: order.original_trailer_id || null,
          originalTrailerNumber: origTrailerMap.get(order.original_trailer_id)?.trailer_number || null,
          originalMiles: order.original_miles || null,
          originalDriverPrice: order.original_driver_price || null,
          recoveryMiles: order.recovery_miles || null,
          recoveryDriverPrice: order.recovery_driver_price || null,
        } as YardLoadOrder;
      });
    },
    staleTime: 120000,
    refetchInterval: 120000,
    retry: 1,
  });
};
