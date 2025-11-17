import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T,>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Query timeout - please check your connection")), timeoutMs),
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

type LoadingPhase = 'phase1' | 'phase2' | 'phase3' | 'complete';

export const useProgressiveReports = () => {
  const queryClient = useQueryClient();
  const { user, profile } = useAuthContext();
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('phase1');

  // Phase 1: Load current user's trucks
  const phase1Query = useQuery({
    queryKey: ["reports", "phase1", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      return queryWithTimeout(async () => {
        console.log("📊 Phase 1: Loading current user's trucks...");
        
        const { data: trucks, error } = await supabase
          .from("trucks")
          .select(`
            *,
            driver1:drivers!trucks_driver1_id_fkey(id, name, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, dispatcher_id, company:companies!company_id(id, name)),
            driver2:drivers!trucks_driver2_id_fkey(id, name, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, dispatcher_id, company:companies!company_id(id, name)),
            trailer:trailer_id(trailer_number),
            company:companies(name)
          `)
          .filter("driver1.dispatcher_id", "eq", user.id)
          .order("id", { ascending: true });

        if (error) throw error;

        // Get driver IDs for fetching orders
        const driverIds = trucks?.flatMap(t => [t.driver1_id, t.driver2_id].filter(Boolean)) || [];

        // Fetch orders for these drivers
        const { data: orders, error: ordersError } = await supabase
          .from("orders")
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
            is_recovery,
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
              checked_out_at,
              going_to_at,
              sequence_number
            ),
            order_files!left(
              id,
              file_category
            )
          `)
          .in("driver1_id", driverIds)
          .order("updated_at", { ascending: false });

        if (ordersError) throw ordersError;

        console.log(`✅ Phase 1 complete: ${trucks?.length || 0} trucks, ${orders?.length || 0} orders`);

        return { trucks, orders, phase: 'phase1' };
      });
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Phase 2: Load same office trucks
  const phase2Query = useQuery({
    queryKey: ["reports", "phase2", user?.id, profile?.office],
    queryFn: async () => {
      if (!user?.id || !profile?.office) return null;
      
      return queryWithTimeout(async () => {
        console.log(`📊 Phase 2: Loading trucks from ${profile.office} office...`);
        
        // Get all dispatchers from same office
        const { data: sameOfficeDispatchers, error: dispatchersError } = await supabase
          .from("profiles")
          .select("user_id")
          .filter("office", "eq", profile.office)
          .neq("user_id", user.id);

        if (dispatchersError) throw dispatchersError;

        const dispatcherIds = sameOfficeDispatchers?.map(d => d.user_id) || [];
        if (dispatcherIds.length === 0) return { trucks: [], orders: [], phase: 'phase2' };

        const { data: trucks, error } = await supabase
          .from("trucks")
          .select(`
            *,
            driver1:drivers!trucks_driver1_id_fkey(id, name, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, dispatcher_id, company:companies!company_id(id, name)),
            driver2:drivers!trucks_driver2_id_fkey(id, name, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, dispatcher_id, company:companies!company_id(id, name)),
            trailer:trailer_id(trailer_number),
            company:companies(name)
          `)
          .filter("driver1.dispatcher_id", "in", `(${dispatcherIds.join(",")})`)
          .order("id", { ascending: true });

        if (error) throw error;

        const driverIds = trucks?.flatMap(t => [t.driver1_id, t.driver2_id].filter(Boolean)) || [];

        const { data: orders, error: ordersError } = await supabase
          .from("orders")
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
            is_recovery,
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
              checked_out_at,
              going_to_at,
              sequence_number
            ),
            order_files!left(
              id,
              file_category
            )
          `)
          .in("driver1_id", driverIds)
          .order("updated_at", { ascending: false });

        if (ordersError) throw ordersError;

        console.log(`✅ Phase 2 complete: ${trucks?.length || 0} trucks, ${orders?.length || 0} orders`);

        return { trucks, orders, phase: 'phase2' };
      });
    },
    enabled: !!user?.id && !!profile?.office && phase1Query.isSuccess,
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Phase 3: Load all other trucks (background)
  const phase3Query = useQuery({
    queryKey: ["reports", "phase3", user?.id, profile?.office],
    queryFn: async () => {
      if (!user?.id) return null;
      
      return queryWithTimeout(async () => {
        console.log("📊 Phase 3: Loading remaining trucks from other offices...");
        
        // Get dispatchers NOT from same office and NOT current user
        const { data: otherDispatchers, error: dispatchersError } = await supabase
          .from("profiles")
          .select("user_id, office")
          .neq("user_id", user.id)
          .filter("office", "neq", profile?.office || '');

        if (dispatchersError) throw dispatchersError;

        const dispatcherIds = otherDispatchers?.map(d => d.user_id) || [];
        if (dispatcherIds.length === 0) return { trucks: [], orders: [], phase: 'phase3' };

        const { data: trucks, error } = await supabase
          .from("trucks")
          .select(`
            *,
            driver1:drivers!trucks_driver1_id_fkey(id, name, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, dispatcher_id, company:companies!company_id(id, name)),
            driver2:drivers!trucks_driver2_id_fkey(id, name, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, dispatcher_id, company:companies!company_id(id, name)),
            trailer:trailer_id(trailer_number),
            company:companies(name)
          `)
          .filter("driver1.dispatcher_id", "in", `(${dispatcherIds.join(",")})`)
          .order("id", { ascending: true });

        if (error) throw error;

        const driverIds = trucks?.flatMap(t => [t.driver1_id, t.driver2_id].filter(Boolean)) || [];

        const { data: orders, error: ordersError } = await supabase
          .from("orders")
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
            is_recovery,
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
              checked_out_at,
              going_to_at,
              sequence_number
            ),
            order_files!left(
              id,
              file_category
            )
          `)
          .in("driver1_id", driverIds)
          .order("updated_at", { ascending: false });

        if (ordersError) throw ordersError;

        console.log(`✅ Phase 3 complete: ${trucks?.length || 0} trucks, ${orders?.length || 0} orders`);

        return { trucks, orders, phase: 'phase3' };
      });
    },
    enabled: !!user?.id && phase2Query.isSuccess,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Update loading phase based on query status
  useEffect(() => {
    if (phase3Query.isSuccess) {
      setLoadingPhase('complete');
    } else if (phase2Query.isSuccess) {
      setLoadingPhase('phase3');
    } else if (phase1Query.isSuccess) {
      setLoadingPhase('phase2');
    }
  }, [phase1Query.isSuccess, phase2Query.isSuccess, phase3Query.isSuccess]);

  // Combine all data
  const combinedTrucks = [
    ...(phase1Query.data?.trucks || []),
    ...(phase2Query.data?.trucks || []),
    ...(phase3Query.data?.trucks || []),
  ];

  const combinedOrders = [
    ...(phase1Query.data?.orders || []),
    ...(phase2Query.data?.orders || []),
    ...(phase3Query.data?.orders || []),
  ];

  return {
    trucks: combinedTrucks,
    orders: combinedOrders,
    loadingPhase,
    isLoading: phase1Query.isLoading,
    isPhase1Loading: phase1Query.isLoading,
    isPhase2Loading: phase2Query.isLoading,
    isPhase3Loading: phase3Query.isLoading,
    error: phase1Query.error || phase2Query.error || phase3Query.error,
  };
};
