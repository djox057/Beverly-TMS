import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Terminal coordinates (Lynwood, IL yard location)
const TERMINAL_LAT = 41.537855;
const TERMINAL_LON = -87.578633;

// Haversine formula to calculate distance between two coordinates in miles
function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.15); // Multiply by 1.15 for approximate road distance
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
  terminalToDeliveryMiles: number | null; // NEW: Miles from terminal to last delivery
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
  // Recovery/transfer fields
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
      // Fetch orders where driver1_id IS NULL and truck_id IS NULL (yard loads)
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          internal_load_number,
          broker_load_number,
          notes,
          mileage,
          driver_price,
          freight_amount,
          booked_by,
          status,
          locked,
          canceled,
          is_recovery,
          truck_id,
          driver1_id,
          trailer_id,
          pickup_datetime,
          delivery_datetime,
          original_driver1_id,
          original_driver2_id,
          original_truck_id,
          original_trailer_id,
          original_miles,
          original_driver_price,
          recovery_miles,
          recovery_driver_price,
          trailer:trailers!orders_trailer_id_fkey (
            id,
            trailer_number
          ),
          broker:brokers!orders_broker_id_fkey (
            name
          ),
          company:companies!orders_company_id_fkey (
            name
          ),
          original_driver:drivers!orders_original_driver1_id_fkey (
            name
          ),
          original_truck:trucks!orders_original_truck_id_fkey (
            truck_number
          ),
          original_trailer:trailers!orders_original_trailer_id_fkey (
            trailer_number
          ),
          pickup_drops (
            id,
            type,
            city,
            state,
            datetime,
            sequence_number,
            latitude,
            longitude
          )
        `)
        .is("driver1_id", null)
        .is("truck_id", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching yard loads:", error);
        throw error;
      }

      // Transform the data
      return (data || []).map((order: any) => {
        const pickups = order.pickup_drops?.filter((pd: any) => pd.type === 'pickup')
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)) || [];
        const deliveries = order.pickup_drops?.filter((pd: any) => pd.type === 'delivery')
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)) || [];
        
        const firstPickup = pickups[0];
        const lastDelivery = deliveries[deliveries.length - 1];

        // Calculate miles from terminal to last delivery
        let terminalToDeliveryMiles: number | null = null;
        if (lastDelivery?.latitude && lastDelivery?.longitude) {
          terminalToDeliveryMiles = calculateDistanceMiles(
            TERMINAL_LAT,
            TERMINAL_LON,
            lastDelivery.latitude,
            lastDelivery.longitude
          );
        }

        return {
          id: order.id,
          internalLoadNumber: order.internal_load_number,
          trailerNumber: order.trailer?.trailer_number || null,
          trailerId: order.trailer_id || null,
          deliveryDate: lastDelivery?.datetime || order.delivery_datetime || null,
          deliveryCity: lastDelivery?.city || null,
          deliveryState: lastDelivery?.state || null,
          pickupDate: order.pickup_datetime || firstPickup?.datetime || null,
          pickupCity: firstPickup?.city || null,
          pickupState: firstPickup?.state || null,
          truckNumber: null,
          driverName: null,
          brokerName: order.broker?.name || null,
          brokerLoadNumber: order.broker_load_number || null,
          notes: order.notes || null,
          mileage: order.mileage || 0,
          terminalToDeliveryMiles,
          driverPrice: order.driver_price || 0,
          freightAmount: order.freight_amount || 0,
          companyName: order.company?.name || null,
          bookedBy: order.booked_by || null,
          status: order.status || 'pending',
          locked: order.locked || false,
          canceled: order.canceled || false,
          isRecovery: order.is_recovery || false,
          truckId: order.truck_id,
          driver1Id: order.driver1_id,
          // Recovery/transfer fields
          originalDriverId: order.original_driver1_id || null,
          originalDriver2Id: order.original_driver2_id || null,
          originalDriverName: order.original_driver?.name || null,
          originalTruckId: order.original_truck_id || null,
          originalTruckNumber: order.original_truck?.truck_number || null,
          originalTrailerId: order.original_trailer_id || null,
          originalTrailerNumber: order.original_trailer?.trailer_number || null,
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
