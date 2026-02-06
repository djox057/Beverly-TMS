import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Hook that subscribes to real-time changes on drivers and related tables.
 * Uses setQueryData to patch cache directly - no full refetch needed.
 */
export function useDriversRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    // Only subscribe once globally
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const QUERY_KEY = ["drivers", "v2"];

    // Fetch a single driver with all relationships (same shape as list query)
    const fetchSingleDriver = async (driverId: string) => {
      const { data: driver, error } = await supabase
        .from("drivers")
        .select(`
          *,
          companies(id, name)
        `)
        .eq("id", driverId)
        .maybeSingle();

      if (error) {
        console.error("[DriversRealtime] Error fetching driver:", error);
        return null;
      }

      if (!driver) return null;

      // Transform companies from array to single object
      const company = Array.isArray(driver.companies)
        ? driver.companies.length > 0
          ? driver.companies[0]
          : null
        : driver.companies || null;

      const { companies, ...cleanDriver } = driver;

      // Fetch truck info for this driver
      const { data: trucksData } = await supabase
        .from("trucks")
        .select(`
          id, 
          truck_number, 
          driver1_id, 
          driver2_id,
          trailer:trailers!trucks_trailer_id_fkey(id, trailer_number)
        `)
        .or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`);

      const truck = trucksData?.[0] || null;

      // Fetch dispatcher info
      let dispatcherInfo = null;
      if (driver.dispatcher_id) {
        const { data: dispatcher } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("user_id", driver.dispatcher_id)
          .maybeSingle();
        
        if (dispatcher) {
          dispatcherInfo = {
            full_name: dispatcher.full_name,
            email: dispatcher.email,
          };
        }
      }

      // Check if driver has account
      let hasAccount = false;
      if (driver.email) {
        const { data: driverRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "driver");

        if (driverRoles && driverRoles.length > 0) {
          const { data: driverProfiles } = await supabase
            .from("profiles")
            .select("email")
            .in(
              "user_id",
              driverRoles.map((r) => r.user_id)
            );

          const driverEmails = new Set(
            driverProfiles?.map((p: any) => p.email.toLowerCase()) || []
          );
          hasAccount = driverEmails.has(driver.email.toLowerCase());
        }
      }

      return {
        ...cleanDriver,
        company,
        truck_info: truck
          ? {
              truck_number: truck.truck_number,
              trailer_number: truck.trailer?.trailer_number || null,
            }
          : null,
        dispatcher_info: dispatcherInfo,
        has_account: hasAccount,
      };
    };

    // Update cache with the transformed driver
    const updateCache = (
      driverId: string,
      transformedDriver: any | null,
      isDelete: boolean = false
    ) => {
      queryClient.setQueryData(QUERY_KEY, (old: any[] | undefined) => {
        if (!old) return isDelete ? old : transformedDriver ? [transformedDriver] : old;

        if (isDelete) {
          console.log(`[DriversRealtime] Removing driver ${driverId} from cache`);
          return old.filter((d) => d.id !== driverId);
        }

        if (!transformedDriver) return old;

        const existingIndex = old.findIndex((d) => d.id === driverId);
        if (existingIndex >= 0) {
          console.log(`[DriversRealtime] Updating driver ${driverId} in cache`);
          const updated = [...old];
          updated[existingIndex] = transformedDriver;
          return updated;
        } else {
          console.log(`[DriversRealtime] Inserting new driver ${driverId} into cache`);
          return [...old, transformedDriver];
        }
      });
    };

    // Handle driver changes
    const handleDriverChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const eventType = payload.eventType;
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const driverId = newRecord?.id || oldRecord?.id;

      console.log(`[DriversRealtime] Driver ${eventType}:`, driverId);

      if (eventType === "DELETE") {
        updateCache(oldRecord.id, null, true);
        return;
      }

      if (!driverId) return;

      const fullDriver = await fetchSingleDriver(driverId);
      if (!fullDriver) {
        console.warn("[DriversRealtime] Could not fetch driver, falling back to invalidation");
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        return;
      }

      updateCache(driverId, fullDriver);
    };

    // Handle truck changes (affects driver.truck_info)
    const handleTruckChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;

      // Find affected drivers (old and new driver assignments)
      const affectedDriverIds = new Set<string>();
      if (newRecord?.driver1_id) affectedDriverIds.add(newRecord.driver1_id);
      if (newRecord?.driver2_id) affectedDriverIds.add(newRecord.driver2_id);
      if (oldRecord?.driver1_id) affectedDriverIds.add(oldRecord.driver1_id);
      if (oldRecord?.driver2_id) affectedDriverIds.add(oldRecord.driver2_id);

      console.log(`[DriversRealtime] Truck change affecting drivers:`, [...affectedDriverIds]);

      // Update each affected driver
      for (const driverId of affectedDriverIds) {
        const fullDriver = await fetchSingleDriver(driverId);
        if (fullDriver) {
          updateCache(driverId, fullDriver);
        }
      }
    };

    // Handle trailer changes (affects driver.truck_info.trailer_number)
    const handleTrailerChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const trailerId = newRecord?.id || oldRecord?.id;

      if (!trailerId) return;

      // Find trucks with this trailer
      const { data: affectedTrucks } = await supabase
        .from("trucks")
        .select("driver1_id, driver2_id")
        .eq("trailer_id", trailerId);

      const affectedDriverIds = new Set<string>();
      affectedTrucks?.forEach((truck) => {
        if (truck.driver1_id) affectedDriverIds.add(truck.driver1_id);
        if (truck.driver2_id) affectedDriverIds.add(truck.driver2_id);
      });

      console.log(`[DriversRealtime] Trailer change affecting drivers:`, [...affectedDriverIds]);

      // Update each affected driver
      for (const driverId of affectedDriverIds) {
        const fullDriver = await fetchSingleDriver(driverId);
        if (fullDriver) {
          updateCache(driverId, fullDriver);
        }
      }
    };

    // Handle company changes
    const handleCompanyChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const companyId = newRecord?.id || oldRecord?.id;

      if (!companyId) return;

      // Find drivers with this company
      const cachedDrivers = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cachedDrivers) return;

      const affectedDriverIds = cachedDrivers
        .filter((d) => d.company?.id === companyId || d.company_id === companyId)
        .map((d) => d.id);

      console.log(`[DriversRealtime] Company change affecting drivers:`, affectedDriverIds);

      // Update each affected driver
      for (const driverId of affectedDriverIds) {
        const fullDriver = await fetchSingleDriver(driverId);
        if (fullDriver) {
          updateCache(driverId, fullDriver);
        }
      }
    };

    // Handle profiles changes (affects dispatcher_info)
    const handleProfileChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const userId = newRecord?.user_id || oldRecord?.user_id;

      if (!userId) return;

      // Find drivers with this dispatcher
      const cachedDrivers = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cachedDrivers) return;

      const affectedDriverIds = cachedDrivers
        .filter((d) => d.dispatcher_id === userId)
        .map((d) => d.id);

      console.log(`[DriversRealtime] Profile change affecting drivers:`, affectedDriverIds);

      // Update each affected driver
      for (const driverId of affectedDriverIds) {
        const fullDriver = await fetchSingleDriver(driverId);
        if (fullDriver) {
          updateCache(driverId, fullDriver);
        }
      }
    };

    // Create channel and subscribe
    const channel = supabase
      .channel("drivers-realtime-advanced")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        handleDriverChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trucks" },
        handleTruckChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trailers" },
        handleTrailerChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "companies" },
        handleCompanyChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        handleProfileChange
      )
      .subscribe((status) => {
        console.log("[DriversRealtime] Subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      console.log("[DriversRealtime] Unsubscribing from drivers channel");
      isSubscribedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
