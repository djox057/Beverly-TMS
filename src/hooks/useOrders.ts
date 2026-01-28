import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef } from "react";
import { getLockedOrders } from "@/utils/ordersCache";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

// Helper function to enrich locked orders with lookup data and fetch pickup_drops/order_files from database
async function enrichLockedOrdersWithLookups(
  lockedOrders: any[],
): Promise<any[]> {
  // Enrich locked orders with lookup data

  // Extract all unique IDs and filter out nulls, undefined, and "null" strings
  const filterValidIds = (ids: any[]) => ids.filter(id => id && id !== "null" && id !== "NULL");
  
  const orderIds = lockedOrders.map((o) => o.id);
  const truckIds = [...new Set(filterValidIds([
    ...lockedOrders.map((o) => o.truck_id),
    ...lockedOrders.map((o) => o.original_truck_id)
  ]))];
  const trailerIds = [...new Set(filterValidIds([
    ...lockedOrders.map((o) => o.trailer_id),
    ...lockedOrders.map((o) => o.original_trailer_id)
  ]))];
  const driver1Ids = [...new Set(filterValidIds(lockedOrders.map((o) => o.driver1_id)))];
  const driver2Ids = [...new Set(filterValidIds(lockedOrders.map((o) => o.driver2_id)))];
  const originalDriver1Ids = [...new Set(filterValidIds(lockedOrders.map((o) => o.original_driver1_id)))];
  const originalDriver2Ids = [...new Set(filterValidIds(lockedOrders.map((o) => o.original_driver2_id)))];
  const brokerIds = [...new Set(filterValidIds(lockedOrders.map((o) => o.broker_id)))];
  const companyIds = [
    ...new Set(filterValidIds([...lockedOrders.map((o) => o.company_id), ...lockedOrders.map((o) => o.booked_by_company_id)])),
  ];


  // Helper to batch fetch data in chunks to avoid URL length limits
  const batchFetch = async (
    table: string,
    select: string,
    ids: string[],
    batchSize = 50
  ): Promise<{ data: any[] }> => {
    if (ids.length === 0) return { data: [] };
    
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      batches.push(ids.slice(i, i + batchSize));
    }
    
    const results = await Promise.all(
      batches.map(async batch => {
        const { data } = await supabase.from(table as any).select(select).in("id", batch);
        return { data: data || [] };
      })
    );
    
    return { data: results.flatMap(r => r.data || []) };
  };

  // Fetch all lookup data from database in parallel with batching
  const allDriverIds = [...new Set([...driver1Ids, ...driver2Ids, ...originalDriver1Ids, ...originalDriver2Ids])];
  
  // Helper to fetch live paid status from database (always authoritative for locked orders)
  const fetchLivePaidStatus = async (): Promise<Map<string, boolean>> => {
    const paidMap = new Map<string, boolean>();
    if (orderIds.length === 0) return paidMap;

    try {
      // IMPORTANT: Large `id=in.(...)` filters can exceed URL limits and return 400.
      // For large locked datasets, fetch all locked (archived) paid statuses via pagination.
      if (orderIds.length > 2000) {
        const pageSize = 1000;
        let offset = 0;

        while (true) {
          const { data, error } = await supabase
            .from("orders")
            .select("id, paid")
            .eq("locked", true)
            .range(offset, offset + pageSize - 1);

          if (error || !data || data.length === 0) break;
          data.forEach((row: any) => paidMap.set(row.id, row.paid === true));

          if (data.length < pageSize) break;
          offset += pageSize;
        }

        return paidMap;
      }

      // For smaller sets, only fetch what we need, but keep batches small to avoid URL limits.
      const batchSize = 200;
      for (let i = 0; i < orderIds.length; i += batchSize) {
        const batch = orderIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("orders")
          .select("id, paid")
          .in("id", batch);

        if (error || !data) continue;
        data.forEach((row: any) => paidMap.set(row.id, row.paid === true));
      }
    } catch (error) {
      console.warn("[useOrders] Could not fetch live paid status:", error);
    }

    return paidMap;
  };
  
  const [trucksData, trailersData, driversData, brokersData, companiesData, pickupDropsData, orderFilesData, orderTransfersData, livePaidStatus] = await Promise.all([
    batchFetch("trucks", "id, truck_number", truckIds),
    batchFetch("trailers", "id, trailer_number", trailerIds),
    batchFetch("drivers", "id, name, company_id, company:companies(id, name)", allDriverIds),
    batchFetch("brokers", "id, name, mc_number, address", brokerIds),
    batchFetch("companies", "id, name", companyIds),
    (async () => {
      if (orderIds.length === 0) return { data: [] };
      const batches: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 50) {
        batches.push(orderIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        batches.map(batch => 
          supabase.from("pickup_drops").select("*").in("order_id", batch)
        )
      );
      return { data: results.flatMap(r => r.data || []) };
    })(),
    // Fetch order_files metadata (id, file_category) for document indicators
    (async () => {
      if (orderIds.length === 0) return { data: [] };
      const batches: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 50) {
        batches.push(orderIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        batches.map(batch => 
          supabase.from("order_files").select("id, order_id, file_category, file_name, file_path").in("order_id", batch)
        )
      );
      return { data: results.flatMap(r => r.data || []) };
    })(),
    // Fetch order_transfers from database for archived orders
    (async () => {
      if (orderIds.length === 0) return { data: [] };
      const batches: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 50) {
        batches.push(orderIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        batches.map(batch => 
          supabase.from("order_transfers").select("*").in("order_id", batch)
        )
      );
      return { data: results.flatMap(r => r.data || []) };
    })(),
    // Fetch live paid status from database (always authoritative, overrides cached value)
    fetchLivePaidStatus(),
  ]);

  // Create lookup maps
  const trucksMap = new Map((trucksData.data || []).map((t) => [t.id, t]));
  const trailersMap = new Map((trailersData.data || []).map((t) => [t.id, t]));
  const driversMap = new Map((driversData.data || []).map((d) => [d.id, d]));
  const brokersMap = new Map((brokersData.data || []).map((b) => [b.id, b]));
  const companiesMap = new Map((companiesData.data || []).map((c) => [c.id, c]));

  // Group pickup_drops, order_files, and order_transfers from database by order_id
  const pickupDropsByOrder = new Map<string, any[]>();
  (pickupDropsData.data || []).forEach((pd) => {
    if (!pickupDropsByOrder.has(pd.order_id)) {
      pickupDropsByOrder.set(pd.order_id, []);
    }
    pickupDropsByOrder.get(pd.order_id)!.push(pd);
  });

  const orderFilesByOrder = new Map<string, any[]>();
  (orderFilesData.data || []).forEach((of) => {
    if (!orderFilesByOrder.has(of.order_id)) {
      orderFilesByOrder.set(of.order_id, []);
    }
    orderFilesByOrder.get(of.order_id)!.push(of);
  });

  const orderTransfersByOrder = new Map<string, any[]>();
  (orderTransfersData.data || []).forEach((ot) => {
    if (!orderTransfersByOrder.has(ot.order_id)) {
      orderTransfersByOrder.set(ot.order_id, []);
    }
    orderTransfersByOrder.get(ot.order_id)!.push(ot);
  });


  // Attach lookup data to each order
  // IMPORTANT: Override paid status with live database value (always wins over cached)
  const enriched = lockedOrders.map((order) => ({
    ...order,
    // Override paid with live database value if available (database always wins)
    paid: livePaidStatus.has(order.id) ? livePaidStatus.get(order.id) : order.paid,
    truck: order.truck_id ? trucksMap.get(order.truck_id) || null : null,
    trailer: order.trailer_id ? trailersMap.get(order.trailer_id) || null : null,
    driver1: order.driver1_id ? driversMap.get(order.driver1_id) || null : null,
    driver2: order.driver2_id ? driversMap.get(order.driver2_id) || null : null,
    original_driver1: order.original_driver1_id ? driversMap.get(order.original_driver1_id) || null : null,
    original_driver2: order.original_driver2_id ? driversMap.get(order.original_driver2_id) || null : null,
    original_truck: order.original_truck_id ? trucksMap.get(order.original_truck_id) || null : null,
    original_trailer: order.original_trailer_id ? trailersMap.get(order.original_trailer_id) || null : null,
    broker: order.broker_id ? brokersMap.get(order.broker_id) || null : null,
    company: order.company_id ? companiesMap.get(order.company_id) || null : null,
    booked_by_company: order.booked_by_company_id ? companiesMap.get(order.booked_by_company_id) || null : null,
    pickup_drops: pickupDropsByOrder.get(order.id) || [],
    order_files: orderFilesByOrder.get(order.id) || [],
    order_transfers: (orderTransfersByOrder.get(order.id) || []).sort((a, b) => a.sequence_number - b.sequence_number),
  }));

  return enriched;
}

interface UseOrdersOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

export const useOrders = (options?: UseOrdersOptions) => {
  const queryClient = useQueryClient();

  // Subscribe to real-time updates
  useOrdersRealtime();

  // Use base key when no filters, or filtered key when filters are provided
  // This allows sharing cache between useOrders and useOrdersWithProgress
  const hasFilters = Boolean(options?.bookedBy || options?.dispatcherUserId);
  const queryKey = hasFilters 
    ? ["orders", "filtered", options?.bookedBy, options?.dispatcherUserId] 
    : ["orders"];

  // Store total unlocked count for background loading verification
  const totalUnlockedCountRef = useRef<number | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const startTime = Date.now();
      console.log("[useOrders] Starting bulk fetch via Edge Function...");

      // If dispatcher user ID is provided, fetch driver IDs assigned to them
      let dispatcherDriverIds: string[] = [];
      if (options?.dispatcherUserId) {
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);
      }

      // Use Edge Function to fetch ALL unlocked orders in a single call
      let allUnlockedOrders: any[] = [];
      
      try {
        const { data: edgeFunctionResponse, error: edgeFunctionError } = await supabase.functions.invoke(
          "get-all-unlocked-orders",
          {
            body: {
              bookedBy: options?.bookedBy || null,
              dispatcherDriverIds: options?.dispatcherUserId ? dispatcherDriverIds : [],
            },
          }
        );

        if (edgeFunctionError) {
          console.error("[useOrders] Edge Function error:", edgeFunctionError);
          throw edgeFunctionError;
        }

        if (edgeFunctionResponse?.orders) {
          allUnlockedOrders = edgeFunctionResponse.orders;
          totalUnlockedCountRef.current = edgeFunctionResponse.count;
          console.log(`[useOrders] ✅ Edge Function returned ${allUnlockedOrders.length} unlocked orders in ${edgeFunctionResponse.fetchTimeMs}ms`);
        }
      } catch (edgeError) {
        // Fallback to direct database fetch if Edge Function fails
        console.warn("[useOrders] Edge Function failed, falling back to direct fetch:", edgeError);
        
        // Get total count
        let countQuery = supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("locked", false);
        
        if (options?.dispatcherUserId) {
          if (options?.bookedBy && dispatcherDriverIds.length > 0) {
            countQuery = countQuery.or(
              `booked_by.eq.${options.bookedBy},driver1_id.in.(${dispatcherDriverIds.join(',')})`
            );
          } else if (options?.bookedBy) {
            countQuery = countQuery.eq("booked_by", options.bookedBy);
          } else if (dispatcherDriverIds.length > 0) {
            countQuery = countQuery.in("driver1_id", dispatcherDriverIds);
          }
        } else if (options?.bookedBy) {
          countQuery = countQuery.eq("booked_by", options.bookedBy);
        }

        const { count: totalUnlockedCount } = await countQuery;
        totalUnlockedCountRef.current = totalUnlockedCount;
        
        // Fetch all unlocked orders in batches
        const BATCH_SIZE = 1000;
        let offset = 0;
        
        while (true) {
          let query = supabase
            .from("orders")
            .select(`
              *,
              pickup_drops (
                id, type, address, city, state, zip_code, datetime, end_datetime,
                sequence_number, arrived_at, checked_out_at, going_to_at,
                company_name, contact_name, contact_phone, special_instructions
              ),
              order_files (id, file_category, file_name, file_path),
              order_transfers (
                id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id,
                miles, driver_price, manual_driver_name, manual_truck_number,
                manual_trailer_number, transfer_date, transfer_city, transfer_state,
                transfer_address, transfer_datetime, transfer_latitude, transfer_longitude,
                driver1:drivers!order_transfers_driver1_id_fkey (id, name),
                driver2:drivers!order_transfers_driver2_id_fkey (id, name),
                truck:trucks!order_transfers_truck_id_fkey (id, truck_number),
                trailer:trailers!order_transfers_trailer_id_fkey (id, trailer_number)
              ),
              recovery_history (
                id, recovery_driver1_id, recovery_driver2_id, recovery_truck_id, recovery_trailer_id,
                recovery_driver1:drivers!recovery_history_recovery_driver1_id_fkey (id, name),
                recovery_driver2:drivers!recovery_history_recovery_driver2_id_fkey (id, name),
                recovery_truck:trucks!recovery_history_recovery_truck_id_fkey (id, truck_number),
                recovery_trailer:trailers!recovery_history_recovery_trailer_id_fkey (id, trailer_number)
              ),
              broker:brokers (id, name, mc_number, address),
              company:companies!orders_company_id_fkey (id, name),
              booked_by_company:companies!orders_booked_by_company_id_fkey (id, name),
              truck:trucks!orders_truck_id_fkey (id, truck_number, company:companies (id, name)),
              trailer:trailers!orders_trailer_id_fkey (id, trailer_number),
              driver1:drivers!orders_driver1_id_fkey (id, name, company_id, company:companies (id, name)),
              driver2:drivers!orders_driver2_id_fkey (id, name, company_id, company:companies (id, name)),
              original_driver1:drivers!orders_original_driver1_id_fkey (id, name),
              original_driver2:drivers!orders_original_driver2_id_fkey (id, name),
              original_truck:trucks!orders_original_truck_id_fkey (id, truck_number),
              original_trailer:trailers!orders_original_trailer_id_fkey (id, trailer_number)
            `)
            .eq("locked", false)
            .order("created_at", { ascending: false })
            .range(offset, offset + BATCH_SIZE - 1);

          // Apply dispatcher filtering
          if (options?.dispatcherUserId) {
            if (options?.bookedBy && dispatcherDriverIds.length > 0) {
              query = query.or(
                `booked_by.eq.${options.bookedBy},driver1_id.in.(${dispatcherDriverIds.join(',')})`
              );
            } else if (options?.bookedBy) {
              query = query.eq("booked_by", options.bookedBy);
            } else if (dispatcherDriverIds.length > 0) {
              query = query.in("driver1_id", dispatcherDriverIds);
            }
          } else if (options?.bookedBy) {
            query = query.eq("booked_by", options.bookedBy);
          }

          const { data: batch, error: batchError } = await query;

          if (batchError || !batch || batch.length === 0) break;

          allUnlockedOrders = allUnlockedOrders.concat(batch);
          
          if (batch.length < BATCH_SIZE) break;
          offset += BATCH_SIZE;
        }
      }

      const fetchTime = Date.now() - startTime;
      console.log(`[useOrders] Unlocked orders fetched: ${allUnlockedOrders.length} in ${fetchTime}ms`);

      // Load LOCKED orders from cache only (no DB fetch for performance)
      let lockedOrders = await getLockedOrders() || [];
      
      // Fetch ALL locked orders from DB that are missing from archive cache
      try {
        const lockedOrderIds = new Set(lockedOrders.map((o: any) => o.id));
        
        let allDbLockedOrders: any[] = [];
        let offset = 0;
        const batchSize = 1000;
        
        while (true) {
          const { data: batch, error: batchError } = await supabase
            .from("orders")
            .select("*")
            .eq("locked", true)
            .order("updated_at", { ascending: false })
            .range(offset, offset + batchSize - 1);
          
          if (batchError || !batch || batch.length === 0) break;
          
          allDbLockedOrders = [...allDbLockedOrders, ...batch];
          offset += batchSize;
          
          if (batch.length < batchSize) break;
        }

        if (allDbLockedOrders.length > 0) {
          const missingLockedOrders = allDbLockedOrders.filter((o: any) => !lockedOrderIds.has(o.id));
          if (missingLockedOrders.length > 0) {
            console.log(`[useOrders] 🔄 Added ${missingLockedOrders.length} locked orders from DATABASE (missing from archive)`);
            lockedOrders = [...lockedOrders, ...missingLockedOrders];
          }
        }
      } catch (error) {
        console.warn('[useOrders] Could not fetch locked orders from DB:', error);
      }
      
      // Filter locked orders for dispatchers
      if (options?.dispatcherUserId && lockedOrders) {
        lockedOrders = lockedOrders.filter(order => {
          const matchesBookedBy = options?.bookedBy && order.booked_by === options.bookedBy;
          const matchesDriver = dispatcherDriverIds.includes(order.driver1_id);
          return matchesBookedBy || matchesDriver;
        });
      }

      // Enrich locked orders with lookup data
      let enrichedLockedOrders: any[] = [];
      if (lockedOrders && lockedOrders.length > 0) {
        enrichedLockedOrders = await enrichLockedOrdersWithLookups(lockedOrders);
      }

      // Deduplicate: remove locked orders if unlocked version exists
      const unlockedOrderIds = new Set(allUnlockedOrders.map(o => o.id));
      const deduplicatedLockedOrders = enrichedLockedOrders.filter(
        order => !unlockedOrderIds.has(order.id)
      );
      
      // Sort locked orders by pickup_datetime descending
      deduplicatedLockedOrders.sort((a, b) => {
        const dateA = a.pickup_datetime || '';
        const dateB = b.pickup_datetime || '';
        return dateB.localeCompare(dateA);
      });
      
      // Merge ALL unlocked orders with deduplicated locked orders
      const mergedOrders = transformOrders([...allUnlockedOrders, ...deduplicatedLockedOrders]);

      const totalTime = Date.now() - startTime;
      console.log(`[useOrders] ✅ COMPLETE: ${allUnlockedOrders.length} unlocked + ${deduplicatedLockedOrders.length} locked = ${mergedOrders.length} total in ${totalTime}ms`);

      return mergedOrders;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    staleTime: Infinity,
  });

  // Real-time subscriptions are handled by useOrdersRealtime hook
  // Cache updates happen via setQueryData, avoiding expensive full refetches
  // NOTE: All unlocked orders are now fetched in a single Edge Function call (no background loading needed)
  return query;
};

// Helper function to fetch a single order with all joins
async function fetchSingleOrder(orderId: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
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
        order_transfers (
          id,
          sequence_number,
          driver1_id,
          driver2_id,
          truck_id,
          trailer_id,
          miles,
          driver_price,
          manual_driver_name,
          manual_truck_number,
          manual_trailer_number,
          transfer_date,
          transfer_city,
          transfer_state,
          transfer_address,
          transfer_datetime,
          transfer_latitude,
          transfer_longitude,
          driver1:drivers!order_transfers_driver1_id_fkey (
            id,
            name
          ),
          driver2:drivers!order_transfers_driver2_id_fkey (
            id,
            name
          ),
          truck:trucks!order_transfers_truck_id_fkey (
            id,
            truck_number
          ),
          trailer:trailers!order_transfers_trailer_id_fkey (
            id,
            trailer_number
          )
        ),
        recovery_history (
          id,
          recovery_driver1_id,
          recovery_driver2_id,
          recovery_truck_id,
          recovery_trailer_id,
          recovery_driver1:drivers!recovery_history_recovery_driver1_id_fkey (
            id,
            name
          ),
          recovery_driver2:drivers!recovery_history_recovery_driver2_id_fkey (
            id,
            name
          ),
          recovery_truck:trucks!recovery_history_recovery_truck_id_fkey (
            id,
            truck_number
          ),
          recovery_trailer:trailers!recovery_history_recovery_trailer_id_fkey (
            id,
            trailer_number
          )
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
      `,
      )
      .eq("id", orderId)
      .single();

    if (error) {
      console.error("[fetchSingleOrder] Error:", error);
      throw error;
    }
    if (!data) {
      return null;
    }

    return transformOrders([data])[0];
  } catch (error) {
    console.error("[fetchSingleOrder] Exception:", orderId, error);
    return null;
  }
}

// transformOrders moved to src/utils/ordersTransform.ts (shared with realtime updates)
