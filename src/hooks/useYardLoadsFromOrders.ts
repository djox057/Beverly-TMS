import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface YardLoadOrder {
  id: string;
  internalLoadNumber: number | null;
  trailerNumber: string | null;
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
          pickup_datetime,
          delivery_datetime,
          trailer:trailers!orders_trailer_id_fkey (
            trailer_number
          ),
          broker:brokers!orders_broker_id_fkey (
            name
          ),
          company:companies!orders_company_id_fkey (
            name
          ),
          pickup_drops (
            id,
            type,
            city,
            state,
            datetime,
            sequence_number
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

        return {
          id: order.id,
          internalLoadNumber: order.internal_load_number,
          trailerNumber: order.trailer?.trailer_number || null,
          deliveryDate: order.delivery_datetime || lastDelivery?.datetime || null,
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
        } as YardLoadOrder;
      });
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });
};
