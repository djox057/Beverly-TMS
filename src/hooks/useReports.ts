import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export const useReports = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('reports-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trucks'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pickup_drops'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateTruckStatus = useMutation({
    mutationFn: async ({ truckId, status }: { truckId: string; status: string }) => {
      const { error } = await supabase
        .from('trucks')
        .update({ status })
        .eq('id', truckId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const updateOrderNote = useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ notes })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const updatePickupDrop = useMutation({
    mutationFn: async ({ pickupDropId, address, datetime }: { pickupDropId: string; address?: string; datetime?: string }) => {
      const updateData: any = {};
      if (address !== undefined) updateData.address = address;
      if (datetime !== undefined) updateData.datetime = datetime;
      
      const { error } = await supabase
        .from('pickup_drops')
        .update(updateData)
        .eq('id', pickupDropId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const reportsQuery = useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      // Fetch trucks with their drivers, dispatchers, and current orders
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select(`
          *,
          driver1:drivers!trucks_driver1_id_fkey(id, name, home_city, home_state),
          dispatcher:dispatcher_id(id, full_name, email),
          orders!orders_truck_id_fkey(
            id,
            status,
            notes,
            updated_at,
           pickup_drops(
             id,
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

      // Filter out trucks without dispatchers and transform the data
      const reportData = trucks?.filter(truck => truck.dispatcher_id).map(truck => {
        const currentOrder = truck.orders && truck.orders.length > 0 
          ? truck.orders.find(order => order.status === 'pending' || order.status === 'in_transit') || truck.orders[0]
          : null;

        const pickupStop = currentOrder?.pickup_drops?.find(stop => stop.type === 'pickup');
        const deliveryStop = currentOrder?.pickup_drops?.find(stop => stop.type === 'delivery');

        // Format location
        const formatLocation = (city: string | null, state: string | null) => {
          if (city && state) return `${city}, ${state}`;
          if (city) return city;
          if (state) return state;
          return "—";
        };

        // Format pickup/delivery info
        const formatStopInfo = (stop: any) => {
          if (!stop) return { id: null, location: "—", date: "—", time: "—" };
          
          // Prioritize city + state over address
          let location = "—";
          if (stop.city && stop.state) {
            location = `${stop.city}, ${stop.state}`;
          } else if (stop.city) {
            location = stop.city;
          } else if (stop.state) {
            location = stop.state;
          } else if (stop.address) {
            location = stop.address.length > 30 ? stop.address.substring(0, 30) + '...' : stop.address;
          }
          
          let date = "—";
          let time = "—";
          
          if (stop.datetime) {
            const datetime = new Date(stop.datetime);
            date = datetime.toLocaleDateString();
            time = datetime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          
          return { id: stop.id, location, date, time };
        };

        // Determine status based on order status and truck status
        let status = "Available";
        if (currentOrder) {
          switch (currentOrder.status) {
            case 'pending':
              status = "Loading";
              break;
            case 'in_transit':
              status = "In Transit";
              break;
            case 'delivered':
              status = "Available";
              break;
            default:
              status = truck.status === 'available' ? "Available" : 
                       truck.status === 'in_use' ? "In Transit" : 
                       truck.status === 'maintenance' ? "Maintenance" : "Available";
          }
        } else {
          status = truck.status === 'available' ? "Available" : 
                   truck.status === 'in_use' ? "In Transit" : 
                   truck.status === 'maintenance' ? "Maintenance" : "Available";
        }

        return {
          id: truck.id,
          orderId: currentOrder?.id,
          truckNumber: truck.truck_number,
          driver: truck.driver1?.name || "Unassigned",
          home: formatLocation(truck.driver1?.home_city, truck.driver1?.home_state),
          dispatcher: truck.dispatcher?.full_name || truck.dispatcher?.email || "Unknown",
          dispatcherId: truck.dispatcher_id,
          status,
          pickup: formatStopInfo(pickupStop),
          delivery: formatStopInfo(deliveryStop),
          awayDays: currentOrder ? Math.floor((Date.now() - new Date(currentOrder.updated_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
          driveHours: 0, // Would need to integrate with tracking system
          shiftHours: 0, // Would need to integrate with tracking system  
          cycleHours: 0, // Would need to integrate with tracking system
          note: currentOrder?.notes || (status === "Available" ? "Ready for dispatch" : "On assignment"),
          lastEdit: currentOrder ? new Date(currentOrder.updated_at).toLocaleString() : new Date(truck.updated_at).toLocaleString(),
          editDate: currentOrder ? new Date(currentOrder.updated_at).toLocaleDateString() : new Date(truck.updated_at).toLocaleDateString()
        };
      }) || [];

      // Group trucks by dispatcher
      const groupedByDispatcher = reportData.reduce((acc, truck) => {
        if (!acc[truck.dispatcherId]) {
          acc[truck.dispatcherId] = {
            dispatcher: truck.dispatcher,
            trucks: []
          };
        }
        acc[truck.dispatcherId].trucks.push(truck);
        return acc;
      }, {} as Record<string, { dispatcher: string; trucks: typeof reportData }>);

      return groupedByDispatcher;
    },
    refetchInterval: 10000, // Refetch every 10 seconds for real-time updates
  });

  return {
    ...reportsQuery,
    updateTruckStatus,
    updateOrderNote,
    updatePickupDrop,
  };
};