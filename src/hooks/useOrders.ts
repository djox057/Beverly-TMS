import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { getLockedOrders, saveLockedOrders } from "@/utils/ordersCache";

interface UseOrdersOptions {
  bookedBy?: string | null;
}

export const useOrders = (options?: UseOrdersOptions) => {
  const queryClient = useQueryClient();
  
  console.log('🔴 [useOrders] ============ HOOK CALLED ============');
  console.log('🔴 [useOrders] Options:', JSON.stringify(options));

  const query = useQuery({
    queryKey: ['orders', options?.bookedBy],
    queryFn: async () => {
      console.log("🟢 [useOrders] ============ QUERYFN EXECUTING ============");
      console.log("🟢 [useOrders] Fetching orders with bookedBy:", options?.bookedBy);
      
      const initialBatchSize = 500;
      const batchSize = 1000;
      
      // Fetch first 500 UNLOCKED orders immediately with joins
      let initialQuery = supabase
        .from("orders")
        .select(`
          *,
          pickup_drops (
            id,
            type,
            address,
            city,
            state,
            zip_code,
            datetime,
            end_datetime,
            sequence_number,
            arrived_at,
            checked_out_at,
            going_to_at,
            company_name,
            contact_name,
            contact_phone,
            special_instructions
          ),
          order_files (
            id,
            file_category,
            file_name,
            file_path,
            file_size,
            content_type,
            uploaded_by,
            created_at
          ),
          broker:brokers (
            id,
            name,
            mc_number,
            address
          ),
          company:companies!orders_company_id_fkey (
            id,
            name
          ),
          booked_by_company:companies!orders_booked_by_company_id_fkey (
            id,
            name
          ),
          truck:trucks!orders_truck_id_fkey (
            id,
            truck_number,
            company:companies (
              id,
              name
            )
          ),
          trailer:trailers!orders_trailer_id_fkey (
            id,
            trailer_number
          ),
          driver1:drivers!orders_driver1_id_fkey (
            id,
            name
          ),
          driver2:drivers!orders_driver2_id_fkey (
            id,
            name
          ),
          original_driver1:drivers!orders_original_driver1_id_fkey (
            id,
            name
          ),
          original_driver2:drivers!orders_original_driver2_id_fkey (
            id,
            name
          ),
          original_truck:trucks!orders_original_truck_id_fkey (
            id,
            truck_number
          ),
          original_trailer:trailers!orders_original_trailer_id_fkey (
            id,
            trailer_number
          )
        `)
        .eq("locked", false)
        .order("created_at", { ascending: false })
        .range(0, initialBatchSize - 1);

      if (options?.bookedBy) {
        initialQuery = initialQuery.eq("booked_by", options.bookedBy);
      }

      const { data: initialBatch, error: initialError } = await initialQuery;

      if (initialError) {
        console.error("[useOrders] Error fetching initial batch:", initialError);
        throw initialError;
      }

      console.log(`[useOrders] ✅ Loaded initial ${initialBatch?.length || 0} UNLOCKED orders`);

      // Continue loading remaining UNLOCKED orders in background
      if (initialBatch && initialBatch.length === initialBatchSize) {
        console.log('[useOrders] Starting background loading...');
        
        // Load in background but don't block initial render
        (async () => {
          try {
            const backgroundOrders = [...initialBatch];
            let offset = initialBatchSize;
            let hasMore = true;
            let batchCount = 1;

            while (hasMore) {
              console.log(`[useOrders] Loading batch ${batchCount} starting at offset ${offset}...`);
              
              let bgQuery = supabase
                .from("orders")
                .select(`
                  *,
                  pickup_drops (
                    id,
                    type,
                    address,
                    city,
                    state,
                    zip_code,
                    datetime,
                    end_datetime,
                    sequence_number,
                    arrived_at,
                    checked_out_at,
                    going_to_at,
                    company_name,
                    contact_name,
                    contact_phone,
                    special_instructions
                  ),
                  order_files (
                    id,
                    file_category,
                    file_name,
                    file_path,
                    file_size,
                    content_type,
                    uploaded_by,
                    created_at
                  ),
                  broker:brokers (
                    id,
                    name,
                    mc_number,
                    address
                  ),
                  company:companies!orders_company_id_fkey (
                    id,
                    name
                  ),
                  booked_by_company:companies!orders_booked_by_company_id_fkey (
                    id,
                    name
                  ),
                  truck:trucks!orders_truck_id_fkey (
                    id,
                    truck_number,
                    company:companies (
                      id,
                      name
                    )
                  ),
                  trailer:trailers!orders_trailer_id_fkey (
                    id,
                    trailer_number
                  ),
                  driver1:drivers!orders_driver1_id_fkey (
                    id,
                    name
                  ),
                  driver2:drivers!orders_driver2_id_fkey (
                    id,
                    name
                  ),
                  original_driver1:drivers!orders_original_driver1_id_fkey (
                    id,
                    name
                  ),
                  original_driver2:drivers!orders_original_driver2_id_fkey (
                    id,
                    name
                  ),
                  original_truck:trucks!orders_original_truck_id_fkey (
                    id,
                    truck_number
                  ),
                  original_trailer:trailers!orders_original_trailer_id_fkey (
                    id,
                    trailer_number
                  )
                `)
                .eq("locked", false)
                .order("created_at", { ascending: false })
                .range(offset, offset + batchSize - 1);

              if (options?.bookedBy) {
                bgQuery = bgQuery.eq("booked_by", options.bookedBy);
              }

              const { data: batch, error: batchError } = await bgQuery;

              if (batchError) {
                console.error(`[useOrders] ❌ Error loading batch ${batchCount}:`, batchError);
                hasMore = false;
                break;
              }
              
              if (!batch || batch.length === 0) {
                console.log(`[useOrders] No more orders to load at offset ${offset}`);
                hasMore = false;
                break;
              }

              console.log(`[useOrders] ✅ Loaded batch ${batchCount}: ${batch.length} orders`);
              backgroundOrders.push(...batch);
              offset += batchSize;
              batchCount++;

              if (batch.length < batchSize) {
                console.log(`[useOrders] Last batch was smaller (${batch.length} < ${batchSize}), stopping`);
                hasMore = false;
              }
              
              // Update cache progressively
              queryClient.setQueryData(['orders', options?.bookedBy], transformOrders(backgroundOrders));
            }

            console.log(`[useOrders] 🎉 Background unlocked orders complete! Total: ${backgroundOrders.length} orders`);
            
            // Now load LOCKED orders from cache or DB
            await loadLockedOrders();
          } catch (error) {
            console.error("[useOrders] ❌ Background loading error:", error);
          }
        })();
      } else {
        console.log('[useOrders] No background loading needed (less than 500 orders)');
        // Still load locked orders even if there are few unlocked ones
        await loadLockedOrders();
      }

      // Helper function to load locked orders
      async function loadLockedOrders() {
        console.log('🔒 [useOrders] Loading LOCKED orders from cache...');
        
        // Load only from local IndexedDB cache
        const lockedOrders = await getLockedOrders();
        
        if (!lockedOrders || lockedOrders.length === 0) {
          console.log('⚠️ [useOrders] No cached locked orders found. Please import data via Data Management page.');
          return;
        }

        console.log('✅ [useOrders] Loaded', lockedOrders.length, 'locked orders from cache');

        // Merge locked orders with query cache using the SAME key structure
        queryClient.setQueryData(['orders', options?.bookedBy], (oldData: any) => {
          if (!oldData) return lockedOrders;
          
          const combined = [...oldData, ...lockedOrders];
          console.log('✅ [useOrders] Combined orders:', combined.length, '(unlocked:', oldData.length, '+ locked:', lockedOrders.length, ')');
          return combined;
        });
      }

      // Get the final merged data after locked orders are loaded (if any)
      const finalData = queryClient.getQueryData(['orders', options?.bookedBy]);
      
      // If we have merged data from cache (unlocked + locked), return it
      if (finalData && Array.isArray(finalData) && finalData.length > (initialBatch?.length || 0)) {
        console.log(`[useOrders] ✅ Returning merged data with locked orders: ${finalData.length} total orders`);
        return finalData;
      }

      const allOrders = initialBatch || [];

      // Transform and return initial batch as fallback
      return transformOrders(allOrders);
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    staleTime: Infinity, // Keep data fresh with real-time updates
  });

  // Monitor when query data changes
  useEffect(() => {
    console.log('🟣 [useOrders] QUERY DATA CHANGED!', {
      dataLength: query.data?.length,
      isLoading: query.isLoading,
      isError: query.isError,
      isFetching: query.isFetching,
      isStale: query.isStale
    });
  }, [query.data, query.isLoading, query.isError, query.isFetching]);

  // Set up real-time subscriptions for automatic updates with smart cache manipulation
  useEffect(() => {
    console.log('🔴 [useOrders] REALTIME EFFECT RUNNING - bookedBy:', options?.bookedBy);
    
    // Force fresh connection with timestamp
    const channelName = `orders-realtime-${Date.now()}`;
    console.log('🔴 [useOrders] Creating channel:', channelName);
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders'
        },
        async (payload) => {
          console.log('🆕 [useOrders] ========= INSERT EVENT =========');
          console.log('🆕 [useOrders] Order ID:', payload.new.id);
          try {
            const newOrder = await fetchSingleOrder(payload.new.id);
            console.log('🆕 [useOrders] Fetched new order:', newOrder ? 'SUCCESS' : 'FAILED');
            
            if (newOrder) {
              const queryKey = ['orders', options?.bookedBy];
              queryClient.setQueryData(queryKey, (old: any) => {
                console.log('🆕 [useOrders] OLD cache length:', old?.length);
                if (!old) return [newOrder];
                const newData = [newOrder, ...old];
                console.log('🆕 [useOrders] NEW cache length:', newData.length);
                return newData;
              });
              console.log('🆕 [useOrders] ✅ INSERT complete');
            }
          } catch (error) {
            console.error('🆕 [useOrders] ❌ Error handling INSERT:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        async (payload) => {
          console.log('🚨🚨🚨 =======================================');
          console.log('🚨🚨🚨 ORDERS TABLE UPDATE EVENT RECEIVED!!!');
          console.log('🚨🚨🚨 =======================================');
          console.log('✏️ [useOrders] Event type:', payload.eventType);
          console.log('✏️ [useOrders] Table:', payload.table);
          console.log('✏️ [useOrders] Schema:', payload.schema);
          console.log('✏️ [useOrders] Order ID:', payload.new.id);
          console.log('✏️ [useOrders] FULL PAYLOAD:', JSON.stringify(payload, null, 2));
          
          try {
            console.log('✏️ [useOrders] Step 1: Fetching updated order from DB...');
            const updatedOrder = await fetchSingleOrder(payload.new.id);
            console.log('✏️ [useOrders] Step 2: Fetch result:', updatedOrder ? '✅ SUCCESS' : '❌ FAILED');
            
            if (!updatedOrder) {
              console.error('✏️ [useOrders] ❌ fetchSingleOrder returned null, aborting update');
              return;
            }
            
            console.log('✏️ [useOrders] Step 3: Updated order details:', {
              id: updatedOrder.id,
              loadNumber: updatedOrder.loadNumber,
              driverPrice: updatedOrder.driverPrice,
              freightAmount: updatedOrder.freightAmount,
              status: updatedOrder.status
            });
            
            const queryKey = ['orders', options?.bookedBy];
            console.log('✏️ [useOrders] Step 4: Query key for cache update:', queryKey);
            
            console.log('✏️ [useOrders] Step 5: Calling setQueryData...');
            queryClient.setQueryData(queryKey, (old: any) => {
              console.log('✏️ [useOrders] Step 6: Inside setQueryData callback');
              console.log('✏️ [useOrders] OLD cache:', {
                exists: !!old,
                isArray: Array.isArray(old),
                length: old?.length,
                firstOrderId: old?.[0]?.id
              });
              
              if (!old || !Array.isArray(old)) {
                console.log('✏️ [useOrders] ❌ No old data or not array, returning [updatedOrder]');
                return [updatedOrder];
              }
              
              const orderIndex = old.findIndex((o: any) => o.id === updatedOrder.id);
              console.log('✏️ [useOrders] Order index in cache:', orderIndex);
              
              if (orderIndex === -1) {
                console.log('✏️ [useOrders] ⚠️ Order not found in cache, adding it');
                return [updatedOrder, ...old];
              }
              
              console.log('✏️ [useOrders] OLD order data:', old[orderIndex]);
              const newData = [...old];
              newData[orderIndex] = updatedOrder;
              console.log('✏️ [useOrders] NEW order data:', newData[orderIndex]);
              console.log('✏️ [useOrders] ✅ Returning updated array, length:', newData.length);
              return newData;
            });
            
            console.log('🎉🎉🎉 UPDATE COMPLETE! Cache should be updated now 🎉🎉🎉');
          } catch (error) {
            console.error('✏️ [useOrders] ❌ Error handling UPDATE:', error);
            console.error('✏️ [useOrders] Error stack:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('🗑️ [useOrders] DELETE event - order:', payload.old.id);
          try {
            queryClient.setQueryData(['orders', options?.bookedBy], (old: any) => {
              console.log('[useOrders] ✅ Order removed from cache');
              if (!old) return [];
              return old.filter((o: any) => o.id !== payload.old.id);
            });
          } catch (error) {
            console.error('[useOrders] ❌ Error handling DELETE:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pickup_drops'
        },
        async (payload) => {
          const orderId = (payload.new as any)?.order_id || (payload.old as any)?.order_id;
          if (orderId) {
            console.log('📍 [useOrders] pickup_drops change for order:', orderId);
            try {
              const updatedOrder = await fetchSingleOrder(orderId);
              if (updatedOrder) {
                queryClient.setQueryData(['orders', options?.bookedBy], (old: any) => {
                  console.log('[useOrders] ✅ Cache updated after pickup_drops change');
                  if (!old) return [updatedOrder];
                  return old.map((o: any) => o.id === orderId ? updatedOrder : o);
                });
              }
            } catch (error) {
              console.error('[useOrders] ❌ Error handling pickup_drops change:', error);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_files'
        },
        async (payload) => {
          const orderId = (payload.new as any)?.order_id || (payload.old as any)?.order_id;
          if (orderId) {
            console.log('📎 [useOrders] order_files change for order:', orderId);
            try {
              const updatedOrder = await fetchSingleOrder(orderId);
              if (updatedOrder) {
                queryClient.setQueryData(['orders', options?.bookedBy], (old: any) => {
                  console.log('[useOrders] ✅ Cache updated after order_files change');
                  if (!old) return [updatedOrder];
                  return old.map((o: any) => o.id === orderId ? updatedOrder : o);
                });
              }
            } catch (error) {
              console.error('[useOrders] ❌ Error handling order_files change:', error);
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log('📡 [useOrders] ========= SUBSCRIPTION STATUS =========');
        console.log('📡 [useOrders] Status:', status);
        console.log('📡 [useOrders] Error:', err);
        console.log('📡 [useOrders] Channel name:', channelName);
        
        if (status === 'SUBSCRIBED') {
          console.log('🟢🟢🟢 [useOrders] ✅✅✅ SUCCESSFULLY SUBSCRIBED TO REALTIME! 🟢🟢🟢');
          console.log('🟢 [useOrders] Listening for INSERT, UPDATE, DELETE on orders table');
          console.log('🟢 [useOrders] Listening for changes on pickup_drops table');
          console.log('🟢 [useOrders] Listening for changes on order_files table');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('🔴🔴🔴 [useOrders] ❌❌❌ CHANNEL ERROR! 🔴🔴🔴');
          console.error('🔴 [useOrders] Error details:', err);
        } else if (status === 'TIMED_OUT') {
          console.error('🔴🔴🔴 [useOrders] ❌❌❌ SUBSCRIPTION TIMED OUT! 🔴🔴🔴');
        } else if (status === 'CLOSED') {
          console.log('🟡 [useOrders] Channel closed');
        } else {
          console.log('🟡 [useOrders] Subscription status:', status);
        }
      });

    return () => {
      console.log('🔴 [useOrders] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [options?.bookedBy, queryClient]);

  return query;
};

// Helper function to fetch a single order with all joins
async function fetchSingleOrder(orderId: string) {
  console.log('📥 [fetchSingleOrder] Fetching order:', orderId);
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        pickup_drops (
          id,
          type,
          address,
          city,
          state,
          zip_code,
          datetime,
          end_datetime,
          sequence_number,
          arrived_at,
          checked_out_at,
          going_to_at,
          company_name,
          contact_name,
          contact_phone,
          special_instructions
        ),
        order_files (
          id,
          file_category,
          file_name,
          file_path,
          file_size,
          content_type,
          uploaded_by,
          created_at
        ),
        broker:brokers (
          id,
          name,
          mc_number,
          address
        ),
        company:companies!orders_company_id_fkey (
          id,
          name
        ),
        booked_by_company:companies!orders_booked_by_company_id_fkey (
          id,
          name
        ),
        truck:trucks!orders_truck_id_fkey (
          id,
          truck_number,
          company:companies (
            id,
            name
          )
        ),
        trailer:trailers!orders_trailer_id_fkey (
          id,
          trailer_number
        ),
        driver1:drivers!orders_driver1_id_fkey (
          id,
          name
        ),
        driver2:drivers!orders_driver2_id_fkey (
          id,
          name
        ),
        original_driver1:drivers!orders_original_driver1_id_fkey (
          id,
          name
        ),
        original_driver2:drivers!orders_original_driver2_id_fkey (
          id,
          name
        ),
        original_truck:trucks!orders_original_truck_id_fkey (
          id,
          truck_number
        ),
        original_trailer:trailers!orders_original_trailer_id_fkey (
          id,
          trailer_number
        )
      `)
      .eq('id', orderId)
      .single();

    if (error) {
      console.error('📥 [fetchSingleOrder] ❌ Error:', error);
      throw error;
    }
    if (!data) {
      console.warn('📥 [fetchSingleOrder] ⚠️ No data returned');
      return null;
    }

    console.log('📥 [fetchSingleOrder] ✅ Data fetched, transforming...');
    // Transform and return the single order
    const transformed = transformOrders([data])[0];
    console.log('📥 [fetchSingleOrder] ✅ Transformation complete');
    return transformed;
  } catch (error) {
    console.error('📥 [fetchSingleOrder] ❌ Exception:', orderId, error);
    return null;
  }
}

// Helper function to transform orders data
function transformOrders(allOrders: any[]) {
  return (allOrders || []).map((order: any) => {
        // Parse JSONB fields back to arrays (already arrays from join)
        const pickupDrops = Array.isArray(order.pickup_drops) ? order.pickup_drops : [];
        const orderFiles = Array.isArray(order.order_files) ? order.order_files : [];

        // Extract pickup and delivery information
        const firstPickup = pickupDrops.find((pd: any) => pd.type === 'pickup');
        const lastDelivery = pickupDrops.filter((pd: any) => pd.type === 'delivery').pop();

        // Calculate total driver pay
        const totalDriverPay = 
          (order.driver_price || 0) +
          (order.detention_driver || 0) +
          (order.layover_driver || 0) +
          (order.tonu_driver || 0) +
          (order.extra_stop_driver || 0) +
          (order.lumper_driver || 0) +
          (order.late_fee_driver || 0) +
          (order.no_tracking_fee_driver || 0) +
          (order.wrong_address_fee_driver || 0) +
          (order.other_charges_driver || 0);

        // Calculate total freight amount
        const totalFreightAmount = 
          (order.freight_amount || 0) +
          (order.detention || 0) +
          (order.layover || 0) +
          (order.tonu || 0) +
          (order.extra_stop || 0) +
          (order.lumper || 0) +
          (order.late_fee || 0) +
          (order.no_tracking_fee || 0) +
          (order.wrong_address_fee || 0) +
          (order.escort_fee || 0) +
          (order.other_charges || 0);

        // Filter files by category
        const rcFiles = orderFiles.filter((f: any) => f.file_category === 'RC');
        const podFiles = orderFiles.filter((f: any) => f.file_category === 'POD');
        const bolFiles = orderFiles.filter((f: any) => f.file_category === 'BOL');

        // Transform to camelCase with computed fields, flattening joined data
        return {
          // Basic fields
          id: order.id,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          loadNumber: order.load_number,
          internalLoadNumber: order.internal_load_number,
          brokerLoadNumber: order.broker_load_number,
          status: order.status,
          locked: order.locked,
          canceled: order.canceled,
          invoiced: order.invoiced,
          isRecovery: order.is_recovery,
          
          // Truck and equipment - flatten joined data
          truckNumber: order.truck?.truck_number || null,
          truckId: order.truck_id,
          truckCompanyName: order.truck?.company?.name || null,
          truckCompanyId: order.truck?.company?.id || null,
          trailerNumber: order.trailer?.trailer_number || null,
          trailerId: order.trailer_id,
          
          // Driver info - flatten joined data
          driverName: order.driver1?.name || null,
          driver1Name: order.driver1?.name || null,
          driver2Name: order.driver2?.name || null,
          driver1Id: order.driver1_id,
          driver2Id: order.driver2_id,
          
          // Broker info - flatten joined data
          brokerName: order.broker?.name || null,
          brokerAddress: order.broker?.address || null,
          brokerMcNumber: order.broker?.mc_number || null,
          brokerId: order.broker_id,
          
          // Company info - flatten joined data
          companyName: order.company?.name || null,
          companyId: order.company_id,
          bookedBy: order.booked_by,
          bookedByCompanyId: order.booked_by_company_id,
          bookedByCompanyName: order.booked_by_company?.name || null,
          
          // Pickup/Delivery extracted info - use ISO date strings for consistent parsing
          pickupDate: firstPickup?.datetime ? firstPickup.datetime : '',
          pickupCity: firstPickup?.city || '',
          pickupState: firstPickup?.state || '',
          deliveryDate: lastDelivery?.datetime ? lastDelivery.datetime : '',
          deliveryCity: lastDelivery?.city || '',
          deliveryState: lastDelivery?.state || '',
          
          // Financial fields - broker amounts
          freightAmount: order.freight_amount,
          detention: order.detention,
          layover: order.layover,
          tonu: order.tonu,
          extraStop: order.extra_stop,
          lumper: order.lumper,
          lateFee: order.late_fee,
          noTrackingFee: order.no_tracking_fee,
          wrongAddressFee: order.wrong_address_fee,
          escortFee: order.escort_fee,
          escortFeeBrokerPaid: order.escort_fee_broker_paid,
          otherCharges: order.other_charges,
          totalFreightAmount,
          
          // Financial fields - driver amounts
          driverPrice: order.driver_price,
          detentionDriver: order.detention_driver,
          layoverDriver: order.layover_driver,
          tonuDriver: order.tonu_driver,
          extraStopDriver: order.extra_stop_driver,
          lumperDriver: order.lumper_driver,
          lateFeeDriver: order.late_fee_driver,
          noTrackingFeeDriver: order.no_tracking_fee_driver,
          wrongAddressFeeDriver: order.wrong_address_fee_driver,
          otherChargesDriver: order.other_charges_driver,
          totalDriverPay,
          
          // Mileage fields
          loadedMiles: order.loaded_miles,
          dhMiles: order.dh_miles,
          mileage: order.mileage,
          
          // Recovery fields
          recoveryDate: order.recovery_date,
          recoveryMiles: order.recovery_miles,
          recoveryFreightAmount: order.recovery_freight_amount,
          recoveryDriverPrice: order.recovery_driver_price,
          
          // Original values
          originalMiles: order.original_miles,
          originalFreightAmount: order.original_freight_amount,
          originalDriverPrice: order.original_driver_price,
          originalLoadedMiles: order.original_loaded_miles,
          originalDhMiles: order.original_dh_miles,
          originalDetention: order.original_detention,
          originalDetentionDriver: order.original_detention_driver,
          originalLayover: order.original_layover,
          originalLayoverDriver: order.original_layover_driver,
          originalTonu: order.original_tonu,
          originalTonuDriver: order.original_tonu_driver,
          originalExtraStop: order.original_extra_stop,
          originalExtraStopDriver: order.original_extra_stop_driver,
          originalLumper: order.original_lumper,
          originalLumperDriver: order.original_lumper_driver,
          originalLateFee: order.original_late_fee,
          originalLateFeeDriver: order.original_late_fee_driver,
          originalNoTrackingFee: order.original_no_tracking_fee,
          originalNoTrackingFeeDriver: order.original_no_tracking_fee_driver,
          originalWrongAddressFee: order.original_wrong_address_fee,
          originalWrongAddressFeeDriver: order.original_wrong_address_fee_driver,
          originalEscortFee: order.original_escort_fee,
          originalEscortFeeBrokerPaid: order.original_escort_fee_broker_paid,
          originalOtherCharges: order.original_other_charges,
          originalOtherChargesDriver: order.original_other_charges_driver,
          originalNotes: order.original_notes,
          originalTruckNumber: order.original_truck?.truck_number || null,
          originalTrailerNumber: order.original_trailer?.trailer_number || null,
          originalDriver1Name: order.original_driver1?.name || null,
          originalDriver2Name: order.original_driver2?.name || null,
          originalTruckId: order.original_truck_id,
          originalTrailerId: order.original_trailer_id,
          originalDriver1Id: order.original_driver1_id,
          originalDriver2Id: order.original_driver2_id,
          
          // Other fields
          notes: order.notes,
          commodity: order.commodity,
          weight: order.weight,
          poNumber: order.po_number,
          puNumber: order.pu_number,
          referenceNumber: order.reference_number,
          pickupDatetime: order.pickup_datetime,
          pickupEndDatetime: order.pickup_end_datetime,
          deliveryDatetime: order.delivery_datetime,
          deliveryEndDatetime: order.delivery_end_datetime,
          dateChangeNotes: order.date_change_notes,
          
          // Nested objects for compatibility - rebuild from joined data
          trucks: order.truck ? {
            truck_number: order.truck.truck_number,
            company: order.truck.company ? {
              id: order.truck.company.id,
              name: order.truck.company.name
            } : null
          } : null,
          trailers: order.trailer ? {
            trailer_number: order.trailer.trailer_number
          } : null,
          drivers: order.driver1 ? {
            name: order.driver1.name
          } : null,
          driver2: order.driver2 ? {
            name: order.driver2.name
          } : null,
          original_driver1: order.original_driver1 ? {
            name: order.original_driver1.name
          } : null,
          original_driver2: order.original_driver2 ? {
            name: order.original_driver2.name
          } : null,
          original_truck: order.original_truck ? {
            truck_number: order.original_truck.truck_number
          } : null,
          original_trailer: order.original_trailer ? {
            trailer_number: order.original_trailer.trailer_number
          } : null,
          brokers: order.broker ? {
            name: order.broker.name,
            address: order.broker.address,
            mc_number: order.broker.mc_number
          } : null,
          company: order.company ? {
            id: order.company.id,
            name: order.company.name
          } : null,
          booked_by_company: order.booked_by_company ? {
            id: order.booked_by_company.id,
            name: order.booked_by_company.name
          } : null,
          
          // Arrays
          pickup_drops: pickupDrops,
          order_files: orderFiles,
          rcFiles,
          podFiles,
          bolFiles,
        };
      });
}
