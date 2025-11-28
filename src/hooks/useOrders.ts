import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { getLockedOrders, getPickupDrops, getOrderFiles } from "@/utils/ordersCache";

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

      // Load LOCKED orders from cache FIRST (before returning)
      console.log('🔒 [useOrders] Loading LOCKED orders from cache...');
      let lockedOrders: any[] | null = null;
      let cachedPickupDrops: any[] | null = null;
      let cachedOrderFiles: any[] | null = null;
      
      try {
        lockedOrders = await getLockedOrders();
        cachedPickupDrops = await getPickupDrops();
        cachedOrderFiles = await getOrderFiles();
      } catch (cacheError) {
        console.error('🚨 [useOrders] Cache loading error:', cacheError);
        // Clear all corrupted cache
        try {
          const { clearCache } = await import("@/utils/ordersCache");
          await clearCache();
          console.log('🗑️ [useOrders] Cleared all corrupted cache after error');
        } catch (clearError) {
          console.error('Failed to clear cache:', clearError);
        }
      }
      
      if (lockedOrders && Array.isArray(lockedOrders) && lockedOrders.length > 0) {
        console.log('✅ [useOrders] Loaded', lockedOrders.length, 'locked orders from cache');
        
        // Merge pickup_drops and order_files into locked orders
        if (cachedPickupDrops && Array.isArray(cachedPickupDrops)) {
          console.log('📍 [useOrders] Merging', cachedPickupDrops.length, 'pickup/drops');
          lockedOrders.forEach(order => {
            if (order && order.id) {
              order.pickup_drops = cachedPickupDrops.filter(pd => pd?.order_id === order.id);
            }
          });
        }
        
        if (cachedOrderFiles && Array.isArray(cachedOrderFiles)) {
          console.log('📄 [useOrders] Merging', cachedOrderFiles.length, 'order files');
          lockedOrders.forEach(order => {
            if (order && order.id) {
              order.order_files = cachedOrderFiles.filter(of => of?.order_id === order.id);
            }
          });
        }
        
        // Fetch lookup data (trucks, drivers, brokers, companies) in one batch
        const uniqueTruckIds = [...new Set(lockedOrders.map(o => o?.truck_id).filter(Boolean))];
        const uniqueDriverIds = [...new Set([
          ...lockedOrders.map(o => o?.driver1_id).filter(Boolean),
          ...lockedOrders.map(o => o?.driver2_id).filter(id => id && id !== 'null')
        ])];
        const uniqueBrokerIds = [...new Set(lockedOrders.map(o => o?.broker_id).filter(Boolean))];
        const uniqueCompanyIds = [...new Set([
          ...lockedOrders.map(o => o?.company_id).filter(Boolean),
          ...lockedOrders.map(o => o?.booked_by_company_id).filter(Boolean)
        ])];
        
        console.log('🔍 [useOrders] Fetching lookups:', {
          trucks: uniqueTruckIds.length,
          drivers: uniqueDriverIds.length,
          brokers: uniqueBrokerIds.length,
          companies: uniqueCompanyIds.length
        });
        
        try {
          // Fetch all in parallel
          const [trucksRes, driversRes, brokersRes, companiesRes, trailersRes] = await Promise.all([
            uniqueTruckIds.length ? supabase.from('trucks').select('id, truck_number, company:companies(id, name)').in('id', uniqueTruckIds) : { data: [] },
            uniqueDriverIds.length ? supabase.from('drivers').select('id, name').in('id', uniqueDriverIds) : { data: [] },
            uniqueBrokerIds.length ? supabase.from('brokers').select('id, name, address, mc_number').in('id', uniqueBrokerIds) : { data: [] },
            uniqueCompanyIds.length ? supabase.from('companies').select('id, name').in('id', uniqueCompanyIds) : { data: [] },
            supabase.from('trailers').select('id, trailer_number')
          ]);
          
          // Create lookup maps
          const truckMap = new Map((trucksRes.data || []).map((t: any) => [t.id, t]));
          const driverMap = new Map((driversRes.data || []).map((d: any) => [d.id, d]));
          const brokerMap = new Map((brokersRes.data || []).map((b: any) => [b.id, b]));
          const companyMap = new Map((companiesRes.data || []).map((c: any) => [c.id, c]));
          const trailerMap = new Map((trailersRes.data || []).map((t: any) => [t.id, t]));
          
          console.log('✅ [useOrders] Fetched lookups:', {
            trucks: truckMap.size,
            drivers: driverMap.size,
            brokers: brokerMap.size,
            companies: companyMap.size,
            trailers: trailerMap.size
          });
          
          // Attach joined data to locked orders (like fresh DB queries would have)
          lockedOrders.forEach((order: any) => {
            if (!order) return;
            if (order.truck_id) order.truck = truckMap.get(order.truck_id) || null;
            if (order.trailer_id) order.trailer = trailerMap.get(order.trailer_id) || null;
            if (order.driver1_id) order.driver1 = driverMap.get(order.driver1_id) || null;
            if (order.driver2_id && order.driver2_id !== 'null') order.driver2 = driverMap.get(order.driver2_id) || null;
            if (order.broker_id) order.broker = brokerMap.get(order.broker_id) || null;
            if (order.company_id) order.company = companyMap.get(order.company_id) || null;
            if (order.booked_by_company_id) order.booked_by_company = companyMap.get(order.booked_by_company_id) || null;
          });
        } catch (lookupError) {
          console.error('🚨 [useOrders] Lookup data fetch failed:', lookupError);
          // Continue without lookup data - orders will show IDs instead of names
        }
      } else {
        console.warn('⚠️ [useOrders] No cached locked orders found. Total data will be incomplete.');
        console.warn('⚠️ [useOrders] Please import archived orders via Data Management page to see all historical data.');
      }

      // Merge initial unlocked orders with locked orders
      const initialMergedOrders = transformOrders([
        ...(initialBatch || []),
        ...(lockedOrders || [])
      ]);
      
      console.log(`[useOrders] ✅ Initial merged data: ${initialMergedOrders.length} orders (${initialBatch?.length || 0} unlocked + ${lockedOrders?.length || 0} locked)`);

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
              
              // Merge with locked orders and update cache progressively
              const mergedData = transformOrders([
                ...backgroundOrders,
                ...(lockedOrders || [])
              ]);
              queryClient.setQueryData(['orders', options?.bookedBy], mergedData);
              console.log(`[useOrders] 📊 Updated cache: ${mergedData.length} total orders`);
            }

            console.log(`[useOrders] 🎉 Background loading complete! Total: ${backgroundOrders.length} unlocked + ${lockedOrders?.length || 0} locked`);
          } catch (error) {
            console.error("[useOrders] ❌ Background loading error:", error);
          }
        })();
      }

      // Return initial merged data (unlocked + locked)
      return initialMergedOrders;
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
  console.log(`🔄 [transformOrders] Processing ${allOrders.length} orders`);
  
  // Helper to safely convert values to numbers, handling "null" strings and undefined
  const toNum = (val: any): number => {
    if (val === null || val === undefined || val === '' || val === 'null' || val === 'NULL') {
      return 0;
    }
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  // Helper to normalize CSV date strings: converts space separator to T, handles string "null" values
  const normalizeDate = (val: any): string => {
    // Handle null, undefined, empty string, or string "null"/"NULL"
    if (!val || val === 'null' || val === 'NULL' || val === 'undefined') {
      return '';
    }
    // Convert to string and replace space with T for ISO format
    return String(val).replace(' ', 'T');
  };
  
  const transformed = (allOrders || []).map((order: any, index: number) => {
        // CRITICAL: Never skip transformation - always recalculate totalFreightAmount
        // This ensures cached orders (which only have freight_amount) get proper totals
        // Parse JSONB fields back to arrays (already arrays from join)
        const pickupDrops = Array.isArray(order.pickup_drops) ? order.pickup_drops : [];
        const orderFiles = Array.isArray(order.order_files) ? order.order_files : [];

        // Extract pickup and delivery information
        const firstPickup = pickupDrops.find((pd: any) => pd.type === 'pickup');
        const lastDelivery = pickupDrops.filter((pd: any) => pd.type === 'delivery').pop();

        // CRITICAL: Handle multiple field name variations
        // - DB orders use snake_case (freight_amount, driver_price)
        // - Some cached orders use camelCase (freightAmount, driverPrice)
        // - CSV cached orders might use shortened names (freight, driverPay)
        // - CSV cached orders may have "null" as STRINGS, not actual null values
        // Use toNum() helper to safely convert all values
        const totalDriverPay = 
          toNum(order.driver_price || order.driverPrice || order.driverPay) +
          toNum(order.detention_driver || order.detentionDriver) +
          toNum(order.layover_driver || order.layoverDriver) +
          toNum(order.tonu_driver || order.tonuDriver) +
          toNum(order.extra_stop_driver || order.extraStopDriver) +
          toNum(order.lumper_driver || order.lumperDriver) +
          toNum(order.late_fee_driver || order.lateFeeDriver) +
          toNum(order.no_tracking_fee_driver || order.noTrackingFeeDriver) +
          toNum(order.wrong_address_fee_driver || order.wrongAddressFeeDriver) +
          toNum(order.other_charges_driver || order.otherChargesDriver);

        // Calculate total freight amount - check freight_amount, freightAmount, AND freight
        // Use toNum() to handle "null" strings from CSV cached data
        const totalFreightAmount = 
          toNum(order.freight_amount || order.freightAmount || order.freight) +
          toNum(order.detention) +
          toNum(order.layover) +
          toNum(order.tonu) +
          toNum(order.extra_stop || order.extraStop) +
          toNum(order.lumper) +
          toNum(order.late_fee || order.lateFee) +
          toNum(order.no_tracking_fee || order.noTrackingFee) +
          toNum(order.wrong_address_fee || order.wrongAddressFee) +
          toNum(order.escort_fee || order.escortFee) +
          toNum(order.other_charges || order.otherCharges);

        // Filter files by category OR check CSV columns for file indicators
        const rcFiles = orderFiles.filter((f: any) => f.file_category === 'RC');
        const podFiles = orderFiles.filter((f: any) => f.file_category === 'POD');
        const bolFiles = orderFiles.filter((f: any) => f.file_category === 'BOL');
        
        // For archived orders from CSV, check multiple possible CSV column names for file indicators
        // CSV export might use: has_rc, hasRc, rc_count, rc_files, etc.
        const hasRcFromCsv = order.has_rc || order.hasRc || order.rc_files || 
                             (order.rc_count && Number(order.rc_count) > 0) ||
                             (order.rcCount && Number(order.rcCount) > 0);
        const hasPodFromCsv = order.has_pod || order.hasPod || order.pod_files || 
                              (order.pod_count && Number(order.pod_count) > 0) ||
                              (order.podCount && Number(order.podCount) > 0);
        
        // Merge arrays: use actual files if available, otherwise create placeholder based on CSV indicators
        const finalRcFiles = rcFiles.length > 0 ? rcFiles : (hasRcFromCsv ? [{ file_category: 'RC', id: 'csv-indicator' }] : []);
        const finalPodFiles = podFiles.length > 0 ? podFiles : (hasPodFromCsv ? [{ file_category: 'POD', id: 'csv-indicator' }] : []);

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
          
          // Truck and equipment - flatten joined data OR CSV columns
          truckNumber: order.truck?.truck_number || order.truck_number || order.truckNumber || null,
          truckId: order.truck_id,
          truckCompanyName: order.truck?.company?.name || order.truck_company_name || order.truckCompanyName || null,
          truckCompanyId: order.truck?.company?.id || order.truck_company_id || null,
          trailerNumber: order.trailer?.trailer_number || order.trailer_number || order.trailerNumber || null,
          trailerId: order.trailer_id,
          
          // Driver info - flatten joined data OR CSV columns
          driverName: order.driver1?.name || order.driver1_name || order.driver_name || order.driverName || null,
          driver1Name: order.driver1?.name || order.driver1_name || order.driver_name || order.driverName || null,
          driver2Name: order.driver2?.name || order.driver2_name || order.driver2Name || null,
          driver1Id: order.driver1_id,
          driver2Id: order.driver2_id,
          
          // Broker info - flatten joined data OR CSV columns
          brokerName: order.broker?.name || order.broker_name || order.brokerName || null,
          brokerAddress: order.broker?.address || order.broker_address || order.brokerAddress || null,
          brokerMcNumber: order.broker?.mc_number || order.broker_mc_number || order.brokerMcNumber || null,
          brokerId: order.broker_id,
          
          // Company info - flatten joined data OR CSV columns
          companyName: order.company?.name || order.company_name || order.companyName || null,
          companyId: order.company_id,
          bookedBy: order.booked_by || order.bookedBy,
          bookedByCompanyId: order.booked_by_company_id,
          bookedByCompanyName: order.booked_by_company?.name || order.booked_by_company_name || order.bookedByCompanyName || null,
          
          // Pickup/Delivery extracted info - use ISO date strings for consistent parsing
          // CRITICAL: For archived orders, pickup_drops may not have datetime field
          // Fallback chain: pickup_drops datetime → order pickup_datetime → CSV pickup_date column
          // Use normalizeDate helper to handle CSV string "null" values and space-to-T conversion
          pickupDate: firstPickup?.datetime 
            ? firstPickup.datetime 
            : normalizeDate(order.pickup_datetime || order.pickupDatetime || order.pickup_date || order.pickupDate),
          pickupCity: firstPickup?.city || order.pickup_city || order.pickupCity || '',
          pickupState: firstPickup?.state || order.pickup_state || order.pickupState || '',
          deliveryDate: lastDelivery?.datetime 
            ? lastDelivery.datetime 
            : normalizeDate(order.delivery_datetime || order.deliveryDatetime || order.delivery_date || order.deliveryDate),
          deliveryCity: lastDelivery?.city || order.delivery_city || order.deliveryCity || '',
          deliveryState: lastDelivery?.state || order.delivery_state || order.deliveryState || '',
          
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
          
          // Other fields - handle "null" strings from CSV
          notes: (order.notes === 'null' || order.notes === 'NULL') ? '' : (order.notes || ''),
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
          
          // Arrays - use final merged files
          pickup_drops: pickupDrops,
          order_files: orderFiles,
          rcFiles: finalRcFiles,
          podFiles: finalPodFiles,
          bolFiles,
        };
      });
  
  console.log(`🔄 [transformOrders] Completed transformation of ${allOrders.length} orders`);
  return transformed;
}
