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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'truck_notes'
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

  const updateTruckNote = useMutation({
    mutationFn: async ({ truckId, note }: { truckId: string; note: string }) => {
      // First check if a note already exists for this truck
      const { data: existingNote } = await supabase
        .from('truck_notes')
        .select('id')
        .eq('truck_id', truckId)
        .maybeSingle();

      if (existingNote) {
        // Update existing note
        const { error } = await supabase
          .from('truck_notes')
          .update({ 
            note,
            updated_by: (await supabase.auth.getUser()).data.user?.id 
          })
          .eq('id', existingNote.id);
        if (error) throw error;
      } else {
        // Create new note
        const { error } = await supabase
          .from('truck_notes')
          .insert({ 
            truck_id: truckId,
            note,
            updated_by: (await supabase.auth.getUser()).data.user?.id 
          });
        if (error) throw error;
      }
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
      // Fetch trucks with their drivers and current orders
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select(`
          *,
          driver1:drivers!trucks_driver1_id_fkey(id, name, home_city, home_state),
          orders!orders_truck_id_fkey(
            id,
            status,
            notes,
            updated_at,
            pickup_datetime,
            pickup_end_datetime,
            delivery_datetime,
            delivery_end_datetime,
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

      // Fetch dispatcher information separately
      const { data: dispatchers, error: dispatchersError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email');

      if (dispatchersError) throw dispatchersError;

      // Fetch truck notes separately
      const { data: truckNotes, error: notesError } = await supabase
        .from('truck_notes')
        .select('*')
        .order('updated_at', { ascending: false });

      if (notesError) throw notesError;

      // Filter out trucks without dispatchers and transform the data
      const reportData = trucks?.filter(truck => truck.dispatcher_id).map(truck => {
        const currentOrder = truck.orders && truck.orders.length > 0 
          ? truck.orders.find(order => order.status === 'pending' || order.status === 'in_transit') || truck.orders[0]
          : null;

        const pickupStop = currentOrder?.pickup_drops?.find(stop => stop.type === 'pickup');
        const deliveryStop = currentOrder?.pickup_drops?.find(stop => stop.type === 'delivery');
        
        // Get the most recent truck note for this truck
        const truckNote = truckNotes?.find(note => note.truck_id === truck.id);

        // Find dispatcher info
        const dispatcherInfo = dispatchers?.find(d => d.user_id === truck.dispatcher_id);

        // Format location
        const formatLocation = (city: string | null, state: string | null) => {
          if (city && state) return `${city}, ${state}`;
          if (city) return city;
          if (state) return state;
          return "—";
        };

        // Format pickup/delivery info
        const formatStopInfo = (stop: any, orderStartTime?: string, orderEndTime?: string) => {
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
          
          // Use order datetime if available, otherwise use stop datetime
          const datetimeToUse = orderStartTime || stop.datetime;
          const endDatetimeToUse = orderEndTime;
          
          if (datetimeToUse) {
            // Handle the datetime to avoid timezone day shifts
            const datetime = new Date(datetimeToUse);
            // Get the date parts directly to avoid timezone issues
            const year = datetime.getUTCFullYear();
            const month = String(datetime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(datetime.getUTCDate()).padStart(2, '0');
            date = `${month}/${day}/${year}`;
            
            // Get the actual stored time (not converted to local timezone)
            const hours = datetime.getUTCHours();
            const minutes = datetime.getUTCMinutes();
            const startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            
            // If there's an end time and it's different from start time, show range
            if (endDatetimeToUse) {
              const endDateTime = new Date(endDatetimeToUse);
              const endHours = endDateTime.getUTCHours();
              const endMinutes = endDateTime.getUTCMinutes();
              const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
              
              if (startTime !== endTime) {
                time = `${startTime} - ${endTime}`;
              } else {
                time = startTime;
              }
            } else {
              time = startTime;
            }
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
          dispatcher: dispatcherInfo?.full_name || dispatcherInfo?.email || "Unknown",
          dispatcherId: truck.dispatcher_id,
          status,
          pickup: formatStopInfo(pickupStop, currentOrder?.pickup_datetime, currentOrder?.pickup_end_datetime),
          delivery: formatStopInfo(deliveryStop, currentOrder?.delivery_datetime, currentOrder?.delivery_end_datetime),
          awayDays: currentOrder ? Math.floor((Date.now() - new Date(currentOrder.updated_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
          driveHours: 0, // Would need to integrate with tracking system
          shiftHours: 0, // Would need to integrate with tracking system  
          cycleHours: 0, // Would need to integrate with tracking system
          note: truckNote?.note || (status === "Available" ? "Ready for dispatch" : "On assignment"),
          lastEdit: truckNote ? new Date(truckNote.updated_at).toLocaleTimeString() : new Date(truck.updated_at).toLocaleTimeString(),
          editDate: truckNote ? new Date(truckNote.updated_at).toLocaleDateString() : new Date(truck.updated_at).toLocaleDateString()
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
    updateTruckNote,
    updatePickupDrop,
  };
};