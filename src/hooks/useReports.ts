import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};
import { parseSimpleDateTime } from "@/utils/dateUtils";

export const useReports = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscriptions with debouncing
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const debouncedInvalidate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['reports'] });
      }, 500); // Debounce 500ms to batch updates
    };

    const channel = supabase
      .channel('reports-consolidated')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trucks'
        },
        debouncedInvalidate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        debouncedInvalidate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pickup_drops'
        },
        debouncedInvalidate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'truck_notes'
        },
        debouncedInvalidate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lost_day_notes'
        },
        debouncedInvalidate
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
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
    onMutate: async ({ truckId, note }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['reports'] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['reports']);

      // Optimistically update to the new value
      queryClient.setQueryData(['reports'], (old: any) => {
        if (!old) return old;
        
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => 
            truck.id === truckId 
              ? { ...truck, note }
              : truck
          )
        }));
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(['reports'], context.previousData);
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
    mutationFn: async ({ truckId, date, note, noteType }: { truckId: string; date: string; note: string; noteType?: string | null }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      
      // Delete note if empty
      if (!note || note.trim() === '') {
        const deleteQuery = supabase
          .from('lost_day_notes')
          .delete()
          .eq('truck_id', truckId)
          .eq('date', date);
        
        if (noteType !== undefined) {
          if (noteType === null) {
            deleteQuery.is('note_type', null);
          } else {
            deleteQuery.eq('note_type', noteType);
          }
        }
        
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;
        return;
      }
      
      // Use upsert with truck_id, date, and note_type as conflict target
      // This allows multiple notes per day (one regular, one home_time)
      const { error: upsertError } = await supabase
        .from('lost_day_notes')
        .upsert({ 
          truck_id: truckId,
          date: date,
          note: note,
          note_type: noteType,
          updated_by: userId
        }, {
          onConflict: 'truck_id,date,note_type'
        });
      
      if (upsertError) throw upsertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const updatePickupDropArrival = useMutation({
    mutationFn: async ({ pickupDropId, arrivalTime }: { pickupDropId: string; arrivalTime?: string }) => {
      let timestamp: string;
      
      if (arrivalTime) {
        // Use the provided arrival time
        timestamp = arrivalTime;
      } else {
        // Use current time as default
        const now = new Date();
        timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      }
      
      const { error } = await supabase
        .from('pickup_drops')
        .update({ arrived_at: timestamp })
        .eq('id', pickupDropId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const markGoingToPickup = useMutation({
    mutationFn: async ({ pickupDropId }: { pickupDropId: string }) => {
      const { error } = await supabase
        .from('pickup_drops')
        .update({ going_to_at: new Date().toISOString() })
        .eq('id', pickupDropId);
      if (error) throw error;
    },
    onMutate: async ({ pickupDropId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['reports'] });
      
      // Optimistically update the cache
      const previousData = queryClient.getQueryData(['reports']);
      queryClient.setQueryData(['reports'], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => ({
            ...truck,
            allOrders: truck.allOrders?.map((order: any) => ({
              ...order,
              pickupStops: order.pickupStops?.map((stop: any) =>
                stop.id === pickupDropId ? { ...stop, going_to_at: new Date().toISOString() } : stop
              ),
            })),
          })),
        }));
      });
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['reports'], context.previousData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const markGoingToDelivery = useMutation({
    mutationFn: async ({ pickupDropId }: { pickupDropId: string }) => {
      const { error } = await supabase
        .from('pickup_drops')
        .update({ going_to_at: new Date().toISOString() })
        .eq('id', pickupDropId);
      if (error) throw error;
    },
    onMutate: async ({ pickupDropId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['reports'] });
      
      // Optimistically update the cache
      const previousData = queryClient.getQueryData(['reports']);
      queryClient.setQueryData(['reports'], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => ({
            ...truck,
            allOrders: truck.allOrders?.map((order: any) => ({
              ...order,
              deliveryStops: order.deliveryStops?.map((stop: any) =>
                stop.id === pickupDropId ? { ...stop, going_to_at: new Date().toISOString() } : stop
              ),
            })),
          })),
        }));
      });
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['reports'], context.previousData);
      }
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
      console.log('📊 Fetching reports data...');
      
      return queryWithTimeout(async () => {
        // Fetch trucks with their drivers and company info
        const { data: trucks, error: trucksError } = await supabase
          .from('trucks')
          .select(`
            *,
            driver1:drivers!trucks_driver1_id_fkey(id, name, phone, email, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, dispatcher_id),
            driver2:drivers!trucks_driver2_id_fkey(id, name, phone, email, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, dispatcher_id),
            trailer:trailer_id(trailer_number),
            company:companies(name)
          `)
          .order('id', { ascending: true });

        if (trucksError) throw trucksError;

        // Fetch all orders separately with their stops and files
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select(`
            id,
            load_number,
            internal_load_number,
            broker_load_number,
            status,
            notes,
            date_change_notes,
            updated_at,
            pickup_datetime,
            pickup_end_datetime,
            delivery_datetime,
            delivery_end_datetime,
            canceled,
            driver1_id,
            driver2_id,
            truck_id,
            pickup_drops(
              id,
              type,
              address,
              city,
              state,
              zip_code,
              datetime,
              end_datetime,
              arrived_at,
              going_to_at,
              sequence_number
            ),
            order_files!left(
              id,
              file_category
            )
          `);

        if (ordersError) throw ordersError;

      // Fetch dispatcher information separately
      const { data: dispatchers, error: dispatchersError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, office, ext')
        .order('user_id', { ascending: true });

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
        .select('*')
        .order('id', { ascending: true });

      if (lostDayError) throw lostDayError;

      // Process trucks and match orders to drivers (not trucks)
      const reportData = trucks?.map(truck => {
        const now = new Date().getTime();
        
        // Get orders for this truck's driver (not the truck itself)
        const driverOrders = orders?.filter(order => 
          (order.driver1_id === truck.driver1_id || order.driver2_id === truck.driver1_id)
        ) || [];
        
        // Categorize orders (exclude GAME-OVER and canceled orders from active orders)
        const activeOrders = driverOrders.filter(order => {
          // Skip GAME-OVER orders - they're visual indicators only
          if (order.notes === 'GAME|OVER') return false;
          
          // Skip canceled orders
          if (order.canceled) return false;
          
          const isActiveStatus = order.status === 'pending' || order.status === 'in_transit';
          const hasNoDeliveryDate = !order.delivery_datetime;
          const deliveryInFuture = order.delivery_datetime && new Date(order.delivery_datetime).getTime() > now;
          
          return isActiveStatus && (hasNoDeliveryDate || deliveryInFuture);
        }) || [];
        
        const recentCompletedOrders = driverOrders.filter(order => {
          // Skip GAME-OVER orders
          if (order.notes === 'GAME|OVER') return false;
          
          // Skip canceled orders
          if (order.canceled) return false;
          
          if (order.status === 'delivered') return true;
          
          // Consider pending orders past delivery time as recently completed
          if (order.status === 'pending' && order.delivery_datetime) {
            const deliveryTime = new Date(order.delivery_datetime).getTime();
            const daysSinceDelivery = (now - deliveryTime) / (1000 * 60 * 60 * 24);
            return deliveryTime <= now && daysSinceDelivery <= 7; // Within last 7 days
          }
          
          return false;
        }) || [];
        
        // Process all orders for this driver (including GAME-OVER for calendar rendering, but excluding canceled orders)
        const allOrdersWithStops = driverOrders.filter(order => !order.canceled).map(order => {
          const pickupStops = (order.pickup_drops?.filter(stop => stop.type === 'pickup') || [])
            .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
          const deliveryStops = (order.pickup_drops?.filter(stop => stop.type === 'delivery') || [])
            .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
          
          // For display: use first pickup and last delivery
          const pickupStop = pickupStops.length > 0 ? pickupStops[0] : null;
          const deliveryStop = deliveryStops.length > 0 ? deliveryStops[deliveryStops.length - 1] : null;
          const documentStatus = getDocumentStatus(order.order_files || []);
          const documentColors = getDocumentColorClass(documentStatus);
          
          return {
            ...order,
            pickupStop,
            deliveryStop,
            pickupStops, // All pickups
            deliveryStops, // All deliveries
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
                zipCode: pickupStop.zip_code || '',
                datetime: pickupStop.datetime || order.pickup_datetime || '—',
                endDatetime: order.pickup_end_datetime || '—'
              } : null,
              deliveryInfo: deliveryStop ? {
                address: deliveryStop.address || '—',
                city: deliveryStop.city || '—', 
                state: deliveryStop.state || '—',
                zipCode: deliveryStop.zip_code || '',
                datetime: deliveryStop.datetime || order.delivery_datetime || '—',
                endDatetime: order.delivery_end_datetime || '—'
              } : null,
              // Include all pickup and delivery stops - use individual stop datetime for multi-stop loads
              allPickupStops: pickupStops.map(stop => ({
                address: stop.address || '—',
                city: stop.city || '—',
                state: stop.state || '—',
                zipCode: stop.zip_code || '',
                datetime: stop.datetime || order.pickup_datetime || '—',
                endDatetime: order.pickup_end_datetime || '—'
              })),
              allDeliveryStops: deliveryStops.map(stop => ({
                address: stop.address || '—',
                city: stop.city || '—',
                state: stop.state || '—',
                zipCode: stop.zip_code || '',
                datetime: stop.datetime || order.delivery_datetime || '—',
                endDatetime: order.delivery_end_datetime || '—'
              })),
              // Simplified document info - only categories needed
              documents: (order.order_files || []).map(file => ({
                category: file.file_category
              })),
              notes: order.notes || '—'
            }
          };
        }) || [];

        // Select primary order for display (backward compatibility, exclude GAME-OVER)
        const currentOrder = allOrdersWithStops.length > 0 
          ? (activeOrders.length > 0 
              ? allOrdersWithStops.find(order => order.isActive && activeOrders.some(active => active.id === order.id))
              : recentCompletedOrders.length > 0
                ? allOrdersWithStops.find(order => order.isRecentCompleted)
                : allOrdersWithStops.find(order => order.notes !== 'GAME|OVER') || null)
          : null;

        // Ensure pickup and delivery come from the SAME order (data integrity fix)
        const pickupStop = currentOrder?.pickupStop;
        const deliveryStop = currentOrder?.deliveryStop;
        
        // Get the most recent truck note for this truck
        const truckNote = truckNotes?.find(note => note.truck_id === truck.id);

        // Get lost day notes for this truck
        const truckLostDayNotes = lostDayNotes?.filter(note => note.truck_id === truck.id) || [];

        // Find dispatcher info from driver1
        const dispatcherInfo = dispatchers?.find(d => d.user_id === truck.driver1?.dispatcher_id);

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
          
          // Build full address with all available components
          let location = "—";
          const parts = [];
          
          if (stop.address) parts.push(stop.address);
          if (stop.city) parts.push(stop.city);
          if (stop.state) parts.push(stop.state);
          
          if (parts.length > 0) {
            location = parts.join(', ');
            // Truncate if too long for display
            if (location.length > 30) {
              location = location.substring(0, 30) + '...';
            }
          }
          
          let date = "—";
          let time = "—";
          
          // Use order datetime if available, otherwise use stop datetime
          const datetimeToUse = orderStartTime || stop.datetime;
          const endDatetimeToUse = orderEndTime;
          
          if (datetimeToUse) {
            // Parse datetime without timezone conversion
            const parsed = parseSimpleDateTime(datetimeToUse);
            date = parsed.dateString;
            const startTime = parsed.timeString;
            
            // If there's an end time and it's different from start time, show range
            if (endDatetimeToUse) {
              const parsedEnd = parseSimpleDateTime(endDatetimeToUse);
              const endTime = parsedEnd.timeString;
              
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

        // Check if it's a team (2 drivers)
        const isTeam = truck.driver1 && truck.driver2;

        return {
          id: truck.id,
          orderId: currentOrder?.id,
          truckNumber: truck.truck_number,
          companyName: truck.company?.name || null,
          driver: isTeam ? "Team" : (truck.driver1?.name || "Unassigned"),
          driver1Name: truck.driver1?.name || "Unassigned",
          driverId: truck.driver1?.id || null,
          driverPhone: truck.driver1?.phone || null,
          driverEmail: truck.driver1?.email || null,
          driver2Id: truck.driver2?.id || null,
          driver2Name: truck.driver2?.name || null,
          driver2Phone: truck.driver2?.phone || null,
          driver2Email: truck.driver2?.email || null,
          trailerNumber: truck.trailer?.trailer_number || null,
          home: truck.driver1?.home_city && truck.driver1?.home_state 
            ? `${truck.driver1.home_city}, ${truck.driver1.home_state}`
            : truck.driver1?.home_city || truck.driver1?.home_state || "—",
          dispatcher: dispatcherInfo?.full_name || dispatcherInfo?.email || "Unknown",
          dispatcherId: truck.driver1?.dispatcher_id,
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
          twoWeekBlockDate: truck.driver1?.two_week_block_date || null,
          note: truckNote?.note || "",
          lastEdit: truckNote ? new Date(truckNote.updated_at).toLocaleTimeString() : new Date(truck.updated_at).toLocaleTimeString(),
          editDate: truckNote ? new Date(truckNote.updated_at).toLocaleDateString() : new Date(truck.updated_at).toLocaleDateString(),
          // Multi-load support
          allOrders: allOrdersWithStops,
          activeOrdersCount: activeOrders.length,
          totalOrdersCount: driverOrders.length || 0,
          hasMultipleOrders: (driverOrders.length || 0) > 1,
          lost_day_notes: truckLostDayNotes,
          milesAway: truck.miles_away || 0
        };
      }) || [];

      // Filter to only include trucks with a dispatcher assigned to driver1
      const trucksWithDispatcher = reportData.filter(truck => truck.dispatcherId);

      // Group trucks by dispatcher - use array to maintain stable order
      const dispatcherMap = new Map<string, { dispatcher: string; dispatcherId: string; office: string | null; ext: string | null; trucks: typeof reportData }>();
      
      for (const truck of trucksWithDispatcher) {
        if (!dispatcherMap.has(truck.dispatcherId)) {
          const dispatcherInfo = dispatchers?.find(d => d.user_id === truck.dispatcherId);
          dispatcherMap.set(truck.dispatcherId, {
            dispatcher: truck.dispatcher,
            dispatcherId: truck.dispatcherId,
            office: dispatcherInfo?.office || null,
            ext: dispatcherInfo?.ext || null,
            trucks: []
          });
        }
        dispatcherMap.get(truck.dispatcherId)!.trucks.push(truck);
      }

      // Convert Map to array
      const groupedData = Array.from(dispatcherMap.values());
      
      // Get current user to sort their dispatcher section first
      const { data: { user } } = await supabase.auth.getUser();
      
      // Sort so current user's dispatcher appears first
      if (user) {
        groupedData.sort((a, b) => {
          const aIsCurrentUser = a.dispatcherId === user.id;
          const bIsCurrentUser = b.dispatcherId === user.id;
          
          if (aIsCurrentUser && !bIsCurrentUser) return -1;
          if (!aIsCurrentUser && bIsCurrentUser) return 1;
          return 0;
        });
      }
      
      return groupedData;
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 300000, // Cache for 5 minutes
    gcTime: 600000, // Keep in memory for 10 minutes
    refetchInterval: 120000, // Refetch every 2 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  return {
    ...reportsQuery,
    updateTruckStatus,
    updateTruckNote,
    updatePickupDrop,
    updateLostDayNote,
    updatePickupDropArrival,
    markGoingToPickup,
    markGoingToDelivery,
  };
};