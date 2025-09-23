import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useReports = () => {
  return useQuery({
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

      // Transform the data for the reports view
      const reportData = trucks?.map(truck => {
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
          if (!stop) return { address: "—", date: "—", time: "—" };
          
          const address = stop.address || "—";
          let date = "—";
          let time = "—";
          
          if (stop.datetime) {
            const datetime = new Date(stop.datetime);
            date = datetime.toLocaleDateString();
            time = datetime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          
          return { address, date, time };
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
          truckNumber: truck.truck_number,
          driver: truck.driver1?.name || "Unassigned",
          home: formatLocation(truck.driver1?.home_city, truck.driver1?.home_state),
          dispatch: truck.dispatcher?.full_name || truck.dispatcher?.email || "Unassigned",
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

      return reportData;
    },
  });
};