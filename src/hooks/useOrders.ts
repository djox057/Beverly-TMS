import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { getLockedOrders, saveLockedOrders } from "@/utils/ordersCache";
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
  
  const [trucksData, trailersData, driversData, brokersData, companiesData, pickupDropsData, orderFilesData, orderTransfersData] = await Promise.all([
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
    // Fetch order_files from database for archived orders (not from cache)
    (async () => {
      if (orderIds.length === 0) return { data: [] };
      const batches: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 50) {
        batches.push(orderIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        batches.map(batch => 
          supabase.from("order_files").select("*").in("order_id", batch)
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
  const enriched = lockedOrders.map((order) => ({
    ...order,
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
  useOrdersRealtime(options);

  const query = useQuery({
    queryKey: ["orders", options?.bookedBy, options?.dispatcherUserId],
    queryFn: async () => {
      const initialBatchSize = 200;
      const batchSize = 500;

      // If dispatcher user ID is provided, fetch driver IDs assigned to them
      let dispatcherDriverIds: string[] = [];
      if (options?.dispatcherUserId) {
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);
      }

      // Fetch first 500 UNLOCKED orders immediately with joins
      let initialQuery = supabase
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
            name,
            company_id,
            company:companies (
              id,
              name
            )
          ),
          driver2:drivers!orders_driver2_id_fkey (
            id,
            name,
            company_id,
            company:companies (
              id,
              name
            )
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
        .eq("locked", false)
        .order("created_at", { ascending: false })
        .range(0, initialBatchSize - 1);

      // Apply dispatcher filtering - include orders booked by them OR with their assigned drivers
      if (options?.dispatcherUserId) {
        // Dispatcher mode: filter by booked_by AND/OR assigned drivers
        if (options?.bookedBy && dispatcherDriverIds.length > 0) {
          // Has both booked_by name and assigned drivers - use OR filter
          initialQuery = initialQuery.or(
            `booked_by.eq.${options.bookedBy},driver1_id.in.(${dispatcherDriverIds.join(',')})`
          );
        } else if (options?.bookedBy) {
          // Only has booked_by name, no assigned drivers
          initialQuery = initialQuery.eq("booked_by", options.bookedBy);
        } else if (dispatcherDriverIds.length > 0) {
          // Only has assigned drivers, no booked_by name yet
          initialQuery = initialQuery.in("driver1_id", dispatcherDriverIds);
        }
        // If neither bookedBy nor drivers, this will return no orders (intended for dispatcher)
      } else if (options?.bookedBy) {
        // Non-dispatcher mode with bookedBy filter
        initialQuery = initialQuery.eq("booked_by", options.bookedBy);
      }

      const { data: initialBatch, error: initialError } = await initialQuery;

      if (initialError) {
        console.error("[useOrders] Error fetching initial batch:", initialError);
        throw initialError;
      }

      // Load LOCKED orders from cache only (no DB fetch for performance)
      let lockedOrders = await getLockedOrders() || [];
      
      // Fetch ALL locked orders from DB that are missing from archive cache
      // This ensures any locked order in the database appears, regardless of archive state
      try {
        const lockedOrderIds = new Set(lockedOrders.map((o: any) => o.id));
        
        const { data: dbLockedOrders, error: dbLockedError } = await supabase
          .from("orders")
          .select("*")
          .eq("locked", true)
          .order("updated_at", { ascending: false });

        if (!dbLockedError && dbLockedOrders) {
          const missingLockedOrders = dbLockedOrders.filter((o: any) => !lockedOrderIds.has(o.id));
          if (missingLockedOrders.length > 0) {
            console.log(`[useOrders] 🔄 Added ${missingLockedOrders.length} locked orders from DATABASE (missing from archive)`);
            lockedOrders = [...lockedOrders, ...missingLockedOrders];
          }
        }
      } catch (error) {
        console.warn('[useOrders] Could not fetch locked orders from DB:', error);
      }
      
      // Filter locked orders for dispatchers (by booked_by or assigned drivers)
      if (options?.dispatcherUserId && lockedOrders) {
        lockedOrders = lockedOrders.filter(order => {
          const matchesBookedBy = options?.bookedBy && order.booked_by === options.bookedBy;
          const matchesDriver = dispatcherDriverIds.includes(order.driver1_id);
          return matchesBookedBy || matchesDriver;
        });
      }

      // Enrich locked orders with lookup data (fetches pickup_drops and order_files from database)
      let enrichedLockedOrders: any[] = [];
      if (lockedOrders && lockedOrders.length > 0) {
        enrichedLockedOrders = await enrichLockedOrdersWithLookups(lockedOrders);
      }

      // Deduplicate: remove locked orders if unlocked version exists
      const unlockedOrderIds = new Set((initialBatch || []).map(o => o.id));
      const deduplicatedLockedOrders = enrichedLockedOrders.filter(
        order => !unlockedOrderIds.has(order.id)
      );
      
      // Sort locked orders by pickup_datetime descending
      deduplicatedLockedOrders.sort((a, b) => {
        const dateA = a.pickup_datetime || '';
        const dateB = b.pickup_datetime || '';
        return dateB.localeCompare(dateA);
      });
      
      // Merge initial unlocked orders with deduplicated locked orders
      const initialMergedOrders = transformOrders([...(initialBatch || []), ...deduplicatedLockedOrders]);

      // Continue loading remaining UNLOCKED orders in background
      if (initialBatch && initialBatch.length === initialBatchSize) {

        // Load in background but don't block initial render
        (async () => {
          try {
            const backgroundOrders = [...initialBatch];
            let offset = initialBatchSize;
            let hasMore = true;
            let batchCount = 1;

            while (hasMore) {
              let bgQuery = supabase
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
                    name,
                    company_id,
                    company:companies (
                      id,
                      name
                    )
                  ),
                  driver2:drivers!orders_driver2_id_fkey (
                    id,
                    name,
                    company_id,
                    company:companies (
                      id,
                      name
                    )
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
                .eq("locked", false)
                .order("created_at", { ascending: false })
                .range(offset, offset + batchSize - 1);

              // Apply dispatcher filtering - include orders booked by them OR with their assigned drivers
              if (options?.dispatcherUserId) {
                // Dispatcher mode: filter by booked_by AND/OR assigned drivers
                if (options?.bookedBy && dispatcherDriverIds.length > 0) {
                  bgQuery = bgQuery.or(
                    `booked_by.eq.${options.bookedBy},driver1_id.in.(${dispatcherDriverIds.join(',')})`
                  );
                } else if (options?.bookedBy) {
                  bgQuery = bgQuery.eq("booked_by", options.bookedBy);
                } else if (dispatcherDriverIds.length > 0) {
                  bgQuery = bgQuery.in("driver1_id", dispatcherDriverIds);
                }
              } else if (options?.bookedBy) {
                bgQuery = bgQuery.eq("booked_by", options.bookedBy);
              }

              const { data: batch, error: batchError } = await bgQuery;

              if (batchError) {
                console.error(`[useOrders] ❌ Error loading batch ${batchCount}:`, batchError);
                hasMore = false;
                break;
              }

              if (!batch || batch.length === 0) {
                hasMore = false;
                break;
              }

              backgroundOrders.push(...batch);
              offset += batchSize;
              batchCount++;

              if (batch.length < batchSize) {
                hasMore = false;
              }

              // Deduplicate again with the new batch
              const currentUnlockedIds = new Set(backgroundOrders.map(o => o.id));
              const currentDeduplicatedLocked = enrichedLockedOrders.filter(
                order => !currentUnlockedIds.has(order.id)
              );
              
              // Sort locked orders by pickup_datetime descending
              currentDeduplicatedLocked.sort((a, b) => {
                const dateA = a.pickup_datetime || '';
                const dateB = b.pickup_datetime || '';
                return dateB.localeCompare(dateA);
              });
              
              // Merge with deduplicated locked orders and update cache progressively
              const mergedData = transformOrders([...backgroundOrders, ...currentDeduplicatedLocked]);
              queryClient.setQueryData(["orders", options?.bookedBy, options?.dispatcherUserId], mergedData);
            }

          } catch (error) {
            console.error("[useOrders] Background loading error:", error);
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

  // Real-time subscriptions are handled by useOrdersRealtime hook
  // Cache updates happen via setQueryData, avoiding expensive full refetches
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

// Helper function to transform orders data
function transformOrders(allOrders: any[]) {
  // Helper to safely convert values to numbers, handling "null" strings and undefined
  const toNum = (val: any): number => {
    if (val === null || val === undefined || val === "" || val === "null" || val === "NULL") {
      return 0;
    }
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const transformed = (allOrders || []).map((order: any) => {
    // CRITICAL: Never skip transformation - always recalculate totalFreightAmount
    // This ensures cached orders (which only have freight_amount) get proper totals
    // Parse JSONB fields back to arrays (already arrays from join)
    const pickupDrops = Array.isArray(order.pickup_drops) ? order.pickup_drops : [];
    const orderFiles = Array.isArray(order.order_files) ? order.order_files : [];

    // Extract pickup and delivery information
    const firstPickup = pickupDrops.find((pd: any) => pd.type === "pickup");
    const lastDelivery = pickupDrops.filter((pd: any) => pd.type === "delivery").pop();

    // CRITICAL: Handle multiple field name variations
    // - DB orders use snake_case (freight_amount, driver_price)
    // - Some cached orders use camelCase (freightAmount, driverPrice)
    // - CSV cached orders might use shortened names (freight, driverPay)
    // - CSV cached orders may have "null" as STRINGS, not actual null values
    // Use toNum() helper to safely convert all values
    // Late fee, no tracking fee, wrong address fee SUBTRACT from driver pay (penalties)
    const totalDriverPay =
      toNum(order.driver_price || order.driverPrice || order.driverPay) +
      toNum(order.detention_driver || order.detentionDriver) +
      toNum(order.layover_driver || order.layoverDriver) +
      toNum(order.tonu_driver || order.tonuDriver) +
      toNum(order.extra_stop_driver || order.extraStopDriver) +
      toNum(order.lumper_driver || order.lumperDriver) -
      toNum(order.late_fee_driver || order.lateFeeDriver) -
      toNum(order.no_tracking_fee_driver || order.noTrackingFeeDriver) -
      toNum(order.wrong_address_fee_driver || order.wrongAddressFeeDriver) +
      toNum(order.other_charges_driver || order.otherChargesDriver);

    // Calculate total freight amount - check freight_amount, freightAmount, AND freight
    // Use toNum() to handle "null" strings from CSV cached data
    // Other Charges SUBTRACTS, Other Additionals ADDS
    // Note: This includes lumper for Orders page display
    const totalFreightAmount =
      toNum(order.freight_amount || order.freightAmount || order.freight) +
      toNum(order.detention) +
      toNum(order.layover) +
      toNum(order.tonu) +
      toNum(order.extra_stop || order.extraStop) +
      toNum(order.lumper) -
      toNum(order.late_fee || order.lateFee) -
      toNum(order.no_tracking_fee || order.noTrackingFee) -
      toNum(order.wrong_address_fee || order.wrongAddressFee) +
      toNum(order.escort_fee || order.escortFee) -
      toNum(order.other_charges || order.otherCharges) +
      toNum(order.other_additionals || order.otherAdditionals);

    // Calculate total freight amount WITHOUT lumper - used for Analytics and Trips pages
    // This represents the net freight for commission calculations (lumper is reimbursement)
    const totalFreightAmountNoLumper =
      toNum(order.freight_amount || order.freightAmount || order.freight) +
      toNum(order.detention) +
      toNum(order.layover) +
      toNum(order.tonu) +
      toNum(order.extra_stop || order.extraStop) +
      toNum(order.escort_fee || order.escortFee) +
      toNum(order.other_additionals || order.otherAdditionals) -
      toNum(order.late_fee || order.lateFee) -
      toNum(order.no_tracking_fee || order.noTrackingFee) -
      toNum(order.wrong_address_fee || order.wrongAddressFee) -
      toNum(order.other_charges || order.otherCharges);

    // Filter files by category
    const rcFiles = orderFiles.filter((f: any) => f.file_category === "RC");
    const podFiles = orderFiles.filter((f: any) => f.file_category === "POD");
    const bolFiles = orderFiles.filter((f: any) => f.file_category === "BOL");

    // Transform to camelCase with computed fields, flattening joined data
    return {
      // Basic fields
      id: order.id,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      loadNumber: order.load_number,
      internalLoadNumber: order.internal_load_number,
      // Convert to string to handle CSV numeric values in string operations
      brokerLoadNumber: order.broker_load_number != null ? String(order.broker_load_number) : null,
      status: order.status,
      locked: order.locked,
      canceled: order.canceled === true || order.canceled === "true" || order.canceled === 1,
      // Handle invoiced boolean - convert string "true"/"false" to actual boolean
      invoiced: order.invoiced === true || order.invoiced === "true" || order.invoiced === 1,
      // Handle paid boolean - convert string "true"/"false" to actual boolean
      paid: order.paid === true || order.paid === "true" || order.paid === 1,
      isRecovery: order.is_recovery === true || order.is_recovery === "true" || order.is_recovery === 1,

      // Truck and equipment - use enriched objects, fallback to deleted_* fields for archived orders
      // Handle "null" strings from CSV export
      truckNumber: order.truck?.truck_number || 
        (order.deleted_truck_number && order.deleted_truck_number !== "null" && order.deleted_truck_number !== "NULL" 
          ? order.deleted_truck_number : null),
      truckId: order.truck_id,
      truckCompanyName: order.truck?.company?.name || null,
      truckCompanyId: order.truck?.company?.id || null,
      trailerNumber: order.trailer?.trailer_number || 
        (order.deleted_trailer_number && order.deleted_trailer_number !== "null" && order.deleted_trailer_number !== "NULL" 
          ? order.deleted_trailer_number : null),
      trailerId: order.trailer_id,

      // Driver info - use enriched objects, fallback to deleted_* fields for archived orders
      // Handle "null" strings from CSV export
      driverName: order.driver1?.name || 
        (order.deleted_driver1_name && order.deleted_driver1_name !== "null" && order.deleted_driver1_name !== "NULL" 
          ? order.deleted_driver1_name : null),
      driver1Name: order.driver1?.name || 
        (order.deleted_driver1_name && order.deleted_driver1_name !== "null" && order.deleted_driver1_name !== "NULL" 
          ? order.deleted_driver1_name : null),
      driver2Name: order.driver2?.name || 
        (order.deleted_driver2_name && order.deleted_driver2_name !== "null" && order.deleted_driver2_name !== "NULL" 
          ? order.deleted_driver2_name : null),
      driver1Id: order.driver1_id,
      driver2Id: order.driver2_id,
      driverCompanyName: order.driver1?.company?.name || null,
      driverCompanyId: order.driver1?.company_id || null,

      // Broker info - use enriched objects only (CSV direct fields are unreliable)
      brokerName: order.broker?.name || null,
      brokerAddress: order.broker?.address || null,
      brokerMcNumber: order.broker?.mc_number || null,
      brokerId: order.broker_id,

      // Company info - flatten joined data OR use direct fields from CSV
      companyName: order.company?.name || order.company_name || null,
      companyId: order.company_id,
      bookedBy: order.booked_by,
      bookedByCompanyName: order.booked_by_company?.name || order.booked_by_company_name || null,
      bookedByCompanyId: order.booked_by_company_id,

      // Pickup/Delivery extracted info - use ISO date strings for consistent parsing
      // CRITICAL: Cached orders don't have pickup_drops array, so fallback to order fields
      // Normalize date format: CSV dates use space separator, convert to ISO format with 'T'
      pickupDate: firstPickup?.datetime
        ? firstPickup.datetime
        : (order.pickup_datetime || order.pickupDatetime || "").replace(" ", "T"),
      pickupCity: firstPickup?.city || "",
      pickupState: firstPickup?.state || "",
      deliveryDate: lastDelivery?.datetime
        ? lastDelivery.datetime
        : (order.delivery_datetime || order.deliveryDatetime || "").replace(" ", "T"),
      deliveryCity: lastDelivery?.city || "",
      deliveryState: lastDelivery?.state || "",

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
      otherChargesReason: (order as any).other_charges_reason,
      otherAdditionals: (order as any).other_additionals,
      otherAdditionalsReason: (order as any).other_additionals_reason,
      totalFreightAmount,
      totalFreightAmountNoLumper,

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
      otherAdditionalsDriver: (order as any).other_additionals_driver,
      totalDriverPay,

      // Mileage fields - always compute mileage from loaded + dh + additional miles
      loadedMiles: order.loaded_miles,
      dhMiles: order.dh_miles,
      additionalMiles: (order as any).additional_miles,
      mileage: toNum(order.loaded_miles) + toNum(order.dh_miles) + toNum((order as any).additional_miles),

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

      // Other fields - handle "null" strings properly
      notes: order.notes === "null" || order.notes === "NULL" || !order.notes ? null : order.notes,
      commodity: order.commodity,
      weight: order.weight,
      poNumber: order.po_number,
      puNumber: order.pu_number,
      referenceNumber: order.reference_number,
      pickupDatetime: order.pickup_datetime,
      pickupEndDatetime: order.pickup_end_datetime,
      deliveryDatetime: order.delivery_datetime,
      deliveryEndDatetime: order.delivery_end_datetime,
      // Ensure null/undefined/"null" string values are properly converted to null
      dateChangeNotes:
        order.date_change_notes === "null" || order.date_change_notes === "NULL" || !order.date_change_notes
          ? null
          : order.date_change_notes,

      // Nested objects for compatibility - rebuild from joined data
      trucks: order.truck
        ? {
            truck_number: order.truck.truck_number,
            company: order.truck.company
              ? {
                  id: order.truck.company.id,
                  name: order.truck.company.name,
                }
              : null,
          }
        : null,
      trailers: order.trailer
        ? {
            trailer_number: order.trailer.trailer_number,
          }
        : null,
      drivers: order.driver1
        ? {
            name: order.driver1.name,
          }
        : null,
      driver2: order.driver2
        ? {
            name: order.driver2.name,
          }
        : null,
      original_driver1: order.original_driver1
        ? {
            name: order.original_driver1.name,
          }
        : null,
      original_driver2: order.original_driver2
        ? {
            name: order.original_driver2.name,
          }
        : null,
      original_truck: order.original_truck
        ? {
            truck_number: order.original_truck.truck_number,
          }
        : null,
      original_trailer: order.original_trailer
        ? {
            trailer_number: order.original_trailer.trailer_number,
          }
        : null,
      brokers: order.broker
        ? {
            name: order.broker.name,
            address: order.broker.address,
            mc_number: order.broker.mc_number,
          }
        : null,
      company: order.company
        ? {
            id: order.company.id,
            name: order.company.name,
          }
        : null,
      booked_by_company: order.booked_by_company
        ? {
            id: order.booked_by_company.id,
            name: order.booked_by_company.name,
          }
        : null,

      // Arrays
      pickup_drops: pickupDrops,
      order_files: orderFiles,
      order_transfers: Array.isArray(order.order_transfers) 
        ? order.order_transfers.sort((a: any, b: any) => a.sequence_number - b.sequence_number)
        : [],
      recoveryHistory: Array.isArray(order.recovery_history) 
        ? order.recovery_history.map((rh: any) => ({
            id: rh.id,
            recoveryDriver1Id: rh.recovery_driver1_id,
            recoveryDriver2Id: rh.recovery_driver2_id,
            recoveryTruckId: rh.recovery_truck_id,
            recoveryTrailerId: rh.recovery_trailer_id,
            recoveryDriver1Name: rh.recovery_driver1?.name,
            recoveryDriver2Name: rh.recovery_driver2?.name,
            recoveryTruckNumber: rh.recovery_truck?.truck_number,
            recoveryTrailerNumber: rh.recovery_trailer?.trailer_number,
            recoveryDriver1: rh.recovery_driver1,
            recoveryDriver2: rh.recovery_driver2,
            recoveryTruck: rh.recovery_truck,
            recoveryTrailer: rh.recovery_trailer,
          }))
        : [],
      rcFiles,
      podFiles,
      bolFiles,
    };
  });

  return transformed;
}
