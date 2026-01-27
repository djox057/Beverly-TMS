import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useCallback } from "react";
import { getLockedOrders, saveLockedOrders } from "@/utils/ordersCache";
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
      // PERFORMANCE: Load only 100 orders initially - background loading completes the rest
      const initialBatchSize = 100;

      // If dispatcher user ID is provided, fetch driver IDs assigned to them
      let dispatcherDriverIds: string[] = [];
      if (options?.dispatcherUserId) {
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);
      }

      // CRITICAL: Fetch the TOTAL count of unlocked orders FIRST
      // This is the source of truth for how many we need to load
      let countQuery = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("locked", false);
      
      // Apply same filters to count query
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
      console.log(`[useOrders] Total unlocked orders in DB: ${totalUnlockedCount}`);

      // Fetch first 100 UNLOCKED orders immediately with joins
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
            file_path
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

      console.log(`[useOrders] Initial batch: ${initialBatch?.length || 0} unlocked orders`);

      // Load LOCKED orders from cache only (no DB fetch for performance)
      let lockedOrders = await getLockedOrders() || [];
      
      // Fetch ALL locked orders from DB that are missing from archive cache
      // This ensures any locked order in the database appears, regardless of archive state
      try {
        const lockedOrderIds = new Set(lockedOrders.map((o: any) => o.id));
        
        // Fetch ALL locked orders from DB - need to paginate to avoid 1000 row limit
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
          
          // If we got less than batchSize, we've reached the end
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

      // Return initial merged data (unlocked + locked)
      // Background loading will fetch remaining unlocked orders automatically
      return initialMergedOrders;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    staleTime: Infinity, // Keep data fresh with real-time updates
  });

  // Background loading state
  const isBackgroundLoadingRef = useRef(false);
  const hasStartedBackgroundLoadRef = useRef(false);
  const isMountedRef = useRef(true);

  // Function to load more unlocked orders using cursor-based pagination
  const loadMoreUnlockedOrders = useCallback(async () => {
    if (isBackgroundLoadingRef.current || !isMountedRef.current) return;
    isBackgroundLoadingRef.current = true;

    try {
      // Get current orders from cache
      const currentOrders = queryClient.getQueryData<any[]>(queryKey) || [];
      const unlockedOrders = currentOrders.filter((o: any) => !o.locked);
      
      if (unlockedOrders.length === 0) {
        isBackgroundLoadingRef.current = false;
        return;
      }

      // Find cursor (oldest unlocked order's created_at)
      const lastUnlocked = unlockedOrders[unlockedOrders.length - 1];
      const cursor = lastUnlocked.createdAt || lastUnlocked.created_at;
      
      if (!cursor) {
        isBackgroundLoadingRef.current = false;
        return;
      }

      // Get dispatcher driver IDs if needed
      let dispatcherDriverIds: string[] = [];
      if (options?.dispatcherUserId) {
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);
      }

      // Fetch next batch of 100 unlocked orders
      let nextQuery = supabase
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
        .lt("created_at", cursor)
        .order("created_at", { ascending: false })
        .limit(100);

      // Apply dispatcher filtering
      if (options?.dispatcherUserId) {
        if (options?.bookedBy && dispatcherDriverIds.length > 0) {
          nextQuery = nextQuery.or(
            `booked_by.eq.${options.bookedBy},driver1_id.in.(${dispatcherDriverIds.join(',')})`
          );
        } else if (options?.bookedBy) {
          nextQuery = nextQuery.eq("booked_by", options.bookedBy);
        } else if (dispatcherDriverIds.length > 0) {
          nextQuery = nextQuery.in("driver1_id", dispatcherDriverIds);
        }
      } else if (options?.bookedBy) {
        nextQuery = nextQuery.eq("booked_by", options.bookedBy);
      }

      const { data: nextBatch, error } = await nextQuery;

      if (error) {
        console.error("[useOrders] Background load error:", error);
        isBackgroundLoadingRef.current = false;
        return;
      }

      if (!nextBatch || nextBatch.length === 0) {
        console.log("[useOrders] Background loading complete - no more orders");
        isBackgroundLoadingRef.current = false;
        return;
      }

      const newOrders = transformOrders(nextBatch);

      // Merge into cache
      if (isMountedRef.current) {
        queryClient.setQueryData<any[]>(queryKey, (old) => {
          if (!old) return newOrders;
          
          const existingIds = new Set(old.map((o: any) => o.id));
          const uniqueNewOrders = newOrders.filter((o: any) => !existingIds.has(o.id));
          
          // Keep locked orders at the end
          const existingUnlocked = old.filter((o: any) => !o.locked);
          const existingLocked = old.filter((o: any) => o.locked);
          
          return [...existingUnlocked, ...uniqueNewOrders, ...existingLocked];
        });
      }

      // Count current unlocked orders after merge
      const updatedOrders = queryClient.getQueryData<any[]>(queryKey) || [];
      const currentUnlockedCount = updatedOrders.filter((o: any) => !o.locked).length;
      console.log(`[useOrders] Loaded ${newOrders.length} more unlocked (total: ${currentUnlockedCount}/${totalUnlockedCountRef.current})`);
      
      isBackgroundLoadingRef.current = false;

      // CRITICAL: Continue loading until we have ALL unlocked orders
      // Check against the known total, not just batch size
      const needsMore = nextBatch.length === 100 || 
        (totalUnlockedCountRef.current !== null && currentUnlockedCount < totalUnlockedCountRef.current);
      
      if (needsMore && isMountedRef.current) {
        setTimeout(() => loadMoreUnlockedOrders(), 100);
      } else {
        console.log(`[useOrders] ✅ Background loading COMPLETE: ${currentUnlockedCount} unlocked orders loaded`);
      }
    } catch (error) {
      console.error("[useOrders] Background load exception:", error);
      isBackgroundLoadingRef.current = false;
    }
  }, [queryClient, queryKey, options?.bookedBy, options?.dispatcherUserId]);

  // Start background loading after initial data is available
  // CRITICAL: Use the total count to determine if we need more, not just the batch size
  useEffect(() => {
    isMountedRef.current = true;
    
    if (query.data && !query.isLoading && !hasStartedBackgroundLoadRef.current) {
      const unlockedCount = query.data.filter((o: any) => !o.locked).length;
      const totalNeeded = totalUnlockedCountRef.current;
      
      // Start background loading if we don't have all unlocked orders
      // Even if initial batch < 100, we still need to verify we have them all
      if (totalNeeded !== null && unlockedCount < totalNeeded) {
        hasStartedBackgroundLoadRef.current = true;
        console.log(`[useOrders] Starting background load: ${unlockedCount}/${totalNeeded} unlocked orders`);
        setTimeout(() => loadMoreUnlockedOrders(), 300);
      } else if (unlockedCount >= 100) {
        // Fallback: if we couldn't get total count but have a full batch, try loading more
        hasStartedBackgroundLoadRef.current = true;
        console.log(`[useOrders] Starting background load (full batch detected): ${unlockedCount} unlocked orders`);
        setTimeout(() => loadMoreUnlockedOrders(), 300);
      } else {
        console.log(`[useOrders] ✅ All ${unlockedCount} unlocked orders loaded (total: ${totalNeeded})`);
      }
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [query.data, query.isLoading, loadMoreUnlockedOrders]);

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
