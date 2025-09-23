import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useFleets = () => {
  return useQuery({
    queryKey: ['fleets'],
    queryFn: async () => {
      // Fetch trucks with their drivers, trailers, and current orders
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select(`
          *,
          driver1:drivers!trucks_driver1_id_fkey(id, name, home_city, home_state),
          trailer:trailers!trucks_trailer_id_fkey(trailer_number, trailer_type),
          orders!orders_truck_id_fkey(
            id,
            status,
            notes,
            updated_at,
            pickup_drops(
              type,
              address,
              city,
              state,
              datetime
            )
          )
        `)
        .order('truck_number');

      if (trucksError) throw trucksError;

      // Transform the data for the fleets view
      const fleetData = trucks?.map(truck => {
        const currentOrder = truck.orders && truck.orders.length > 0 
          ? truck.orders.find(order => order.status === 'pending' || order.status === 'in_transit') || truck.orders[0]
          : null;

        const pickupStop = currentOrder?.pickup_drops?.find(stop => stop.type === 'pickup');
        const deliveryStop = currentOrder?.pickup_drops?.find(stop => stop.type === 'delivery');

        return {
          id: truck.id,
          truckNumber: truck.truck_number,
          driver: truck.driver1?.name || "Unassigned",
          trailer: truck.trailer?.trailer_number || "—",
          trailerType: truck.trailer?.trailer_type || "—",
          status: currentOrder?.status || truck.status || 'available',
          pickup: pickupStop?.address || "—",
          delivery: deliveryStop?.address || "—",
          note: currentOrder?.notes || "",
          orderId: currentOrder?.id || null,
          fleetAssignment: truck.fleet_assignment || "—"
        };
      }) || [];

      return fleetData;
    },
  });
};

export const useUpdateFleetStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ truckId, orderId, status }: { truckId: string; orderId: string | null; status: string }) => {
      if (orderId) {
        // Update order status
        const { error } = await supabase
          .from('orders')
          .update({ status })
          .eq('id', orderId);
        
        if (error) throw error;
      } else {
        // Update truck status if no order
        const { error } = await supabase
          .from('trucks')
          .update({ status })
          .eq('id', truckId);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleets'] });
      toast({
        title: "Success",
        description: "Status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateFleetNote = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderId, note }: { orderId: string | null; note: string }) => {
      if (!orderId) {
        throw new Error("Cannot update note without an order");
      }

      const { error } = await supabase
        .from('orders')
        .update({ notes: note })
        .eq('id', orderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleets'] });
      toast({
        title: "Success",
        description: "Note updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update note",
        variant: "destructive",
      });
    },
  });
};

export const useUpdatePickupDelivery = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      orderId, 
      type, 
      address 
    }: { 
      orderId: string | null; 
      type: 'pickup' | 'delivery'; 
      address: string 
    }) => {
      if (!orderId) {
        throw new Error("Cannot update pickup/delivery without an order");
      }

      // Find the pickup/delivery stop to update
      const { data: stops, error: fetchError } = await supabase
        .from('pickup_drops')
        .select('id')
        .eq('order_id', orderId)
        .eq('type', type)
        .limit(1);

      if (fetchError) throw fetchError;

      if (stops && stops.length > 0) {
        // Update existing stop
        const { error } = await supabase
          .from('pickup_drops')
          .update({ address })
          .eq('id', stops[0].id);
        
        if (error) throw error;
      } else {
        // Create new stop
        const { error } = await supabase
          .from('pickup_drops')
          .insert({ 
            order_id: orderId,
            type,
            address,
            sequence_number: type === 'pickup' ? 1 : 2
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleets'] });
      toast({
        title: "Success",
        description: "Location updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update location",
        variant: "destructive",
      });
    },
  });
};