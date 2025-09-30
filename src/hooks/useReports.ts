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
          queryClient.invalidateQueries({ queryKey: ['orders'] });
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
          queryClient.invalidateQueries({ queryKey: ['orders'] });
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lost_day_notes'
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

  const updateLostDayNote = useMutation({
    mutationFn: async ({ truckId, date, note }: { truckId: string; date: string; note: string }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      
      // Try to update existing note, if not exists, insert new one
      const { error: upsertError } = await supabase
        .from('lost_day_notes')
        .upsert({ 
          truck_id: truckId,
          date: date,
          note: note,
          updated_by: userId
        }, {
          onConflict: 'truck_id,date'
        });
      
      if (upsertError) throw upsertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  // Helper function to determine document status
  const getDocumentStatus = (orderFiles: any[]) => {
    if (!orderFiles || orderFiles.length === 0) return 'none';
    
    const hasRC = orderFiles.some(file => file.file_category === 'RC');
    const hasBOL = orderFiles.some(file => file.file_category === 'BOL');
    const hasPOD = orderFiles.some(file => file.file_category === 'POD');
    
    if (hasRC && hasBOL && hasPOD) return 'complete';
    if (hasRC && hasBOL) return 'partial';
    if (hasRC) return 'minimal';
    return 'none';
  };

  // Helper function to get color classes based on document status
  const getDocumentColorClass = (documentStatus: string) => {
    switch (documentStatus) {
      case 'complete':
        return { bg: 'bg-green-600', text: 'text-green-100', border: 'border-green-700' };
      case 'partial':
        return { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-300' };
      case 'minimal':
        return { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
    }
  };

  const reportsQuery = useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      // Fetch trucks with their drivers and current orders
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select(`
          *,
          driver1:drivers!trucks_driver1_id_fkey(id, name, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated),
          orders!orders_truck_id_fkey(
            id,
            load_number,
            internal_load_number,
            broker_load_number,
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
           ),
           order_files(
             id,
             file_category,
             file_name,
             content_type
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

      // Fetch lost day notes separately
      const { data: lostDayNotes, error: lostDayError } = await supabase
        .from('lost_day_notes')
        .select('*');

      if (lostDayError) throw lostDayError;

      // Filter out trucks without dispatchers and transform the data
      const reportData = trucks?.filter(truck => truck.dispatcher_id).map(truck => {
        const now = new Date().getTime();
        
        // Categorize orders
        const activeOrders = truck.orders?.filter(order => {
          const isActiveStatus = order.status === 'pending' || order.status === 'in_transit';
          const hasNoDeliveryDate = !order.delivery_datetime;
          const deliveryInFuture = order.delivery_datetime && new Date(order.delivery_datetime).getTime() > now;
          
          return isActiveStatus && (hasNoDeliveryDate || deliveryInFuture);
        }) || [];
        
        const recentCompletedOrders = truck.orders?.filter(order => {
          if (order.status === 'delivered') return true;
          
          // Consider pending orders past delivery time as recently completed
          if (order.status === 'pending' && order.delivery_datetime) {
            const deliveryTime = new Date(order.delivery_datetime).getTime();
            const daysSinceDelivery = (now - deliveryTime) / (1000 * 60 * 60 * 24);
            return deliveryTime <= now && daysSinceDelivery <= 7; // Within last 7 days
          }
          
          return false;
        }) || [];
        
        // Process all orders for this truck instead of selecting just one
        const allOrdersWithStops = truck.orders?.map(order => {
          const pickupStop = order.pickup_drops?.find(stop => stop.type === 'pickup');
          const deliveryStop = order.pickup_drops?.find(stop => stop.type === 'delivery');
          const documentStatus = getDocumentStatus(order.order_files || []);
          const documentColors = getDocumentColorClass(documentStatus);
          
          return {
            ...order,
            pickupStop,
            deliveryStop,
            isActive: activeOrders.some(activeOrder => activeOrder.id === order.id),
            isRecentCompleted: recentCompletedOrders.some(completedOrder => completedOrder.id === order.id),
            documentStatus,
            documentColors,
            // Format load details for info display
            loadDetails: {
              loadNumber: order.internal_load_number || '—',
              brokerLoadNumber: order.broker_load_number || '—',
              pickupInfo: pickupStop ? {
                address: pickupStop.address || '—',
                city: pickupStop.city || '—',
                state: pickupStop.state || '—',
                datetime: pickupStop.datetime || order.pickup_datetime || '—',
                endDatetime: order.pickup_end_datetime || '—'
              } : null,
              deliveryInfo: deliveryStop ? {
                address: deliveryStop.address || '—',
                city: deliveryStop.city || '—', 
                state: deliveryStop.state || '—',
                datetime: deliveryStop.datetime || order.delivery_datetime || '—',
                endDatetime: order.delivery_end_datetime || '—'
              } : null,
              documents: (order.order_files || []).map(file => ({
                category: file.file_category,
                name: file.file_name,
                type: file.content_type
              })),
              notes: order.notes || '—'
            }
          };
        }) || [];

        // Select primary order for display (backward compatibility)
        const currentOrder = allOrdersWithStops.length > 0 
          ? (activeOrders.length > 0 
              ? allOrdersWithStops.find(order => order.isActive && activeOrders.some(active => active.id === order.id))
              : recentCompletedOrders.length > 0
                ? allOrdersWithStops.find(order => order.isRecentCompleted)
                : allOrdersWithStops[0])
          : null;

        // Ensure pickup and delivery come from the SAME order (data integrity fix)
        const pickupStop = currentOrder?.pickupStop;
        const deliveryStop = currentOrder?.deliveryStop;
        
        // Get the most recent truck note for this truck
        const truckNote = truckNotes?.find(note => note.truck_id === truck.id);

        // Get lost day notes for this truck
        const truckLostDayNotes = lostDayNotes?.filter(note => note.truck_id === truck.id) || [];

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
          driveHours: truck.driver1?.hos_drive_minutes ? `${Math.floor(truck.driver1.hos_drive_minutes / 60)}:${String(truck.driver1.hos_drive_minutes % 60).padStart(2, '0')}h` : '0:00h',
          shiftHours: truck.driver1?.hos_shift_minutes ? `${Math.floor(truck.driver1.hos_shift_minutes / 60)}:${String(truck.driver1.hos_shift_minutes % 60).padStart(2, '0')}h` : '0:00h',
           cycleHours: truck.driver1?.hos_cycle_minutes ? `${Math.floor(truck.driver1.hos_cycle_minutes / 60)}:${String(truck.driver1.hos_cycle_minutes % 60).padStart(2, '0')}h` : '0:00h',
           driveMinutes: truck.driver1?.hos_drive_minutes || 0,
           shiftMinutes: truck.driver1?.hos_shift_minutes || 0,
           breakMinutes: truck.driver1?.hos_break_minutes || 0,
           cycleMinutes: truck.driver1?.hos_cycle_minutes || 0,
          hosStatus: truck.driver1?.hos_status || null,
          hosLastUpdated: truck.driver1?.hos_last_updated || null,
          note: truckNote?.note || (status === "Available" ? "Ready for dispatch" : "On assignment"),
          lastEdit: truckNote ? new Date(truckNote.updated_at).toLocaleTimeString() : new Date(truck.updated_at).toLocaleTimeString(),
          editDate: truckNote ? new Date(truckNote.updated_at).toLocaleDateString() : new Date(truck.updated_at).toLocaleDateString(),
          // Multi-load support
          allOrders: allOrdersWithStops,
          activeOrdersCount: activeOrders.length,
          totalOrdersCount: truck.orders?.length || 0,
          hasMultipleOrders: (truck.orders?.length || 0) > 1,
          lostDayNotes: truckLostDayNotes
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
    updateLostDayNote,
  };
};