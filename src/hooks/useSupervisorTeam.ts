import { teamIncludesBooker, teamIncludesOrder, type TeamOrder } from "@/lib/dispatchAccess";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Team visibility is an exception for loads, trips and performance only.
export function useSupervisorTeam(subscribe = true) {
  const { profile, getPrimaryRole } = useAuthContext();
  const isSupervisor = getPrimaryRole() === "supervisor";
  const userId = profile?.user_id;
  const queryClient = useQueryClient();
  const key = ["supervisor-team", userId];
  const query = useQuery({
    queryKey: key,
    enabled: isSupervisor && !!userId,
    queryFn: async () => {
      const { data: assignments, error } = await supabase.from("dispatcher_supervisors")
        .select("dispatcher_id").eq("supervisor_id", userId!);
      if (error) throw error;
      const ids = [...new Set([userId!, ...(assignments ?? []).map((a) => a.dispatcher_id)])];
      const [profiles, drivers] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
        supabase.from("drivers").select("id").in("dispatcher_id", ids),
      ]);
      if (profiles.error) throw profiles.error;
      if (drivers.error) throw drivers.error;
      return { ids, names: (profiles.data ?? []).map((p) => p.full_name).filter((n): n is string => !!n),
        driverIds: (drivers.data ?? []).map((d) => d.id) };
    },
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!subscribe || !isSupervisor || !userId) return;
    const channel = supabase.channel(`supervisor-team-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatcher_supervisors", filter: `supervisor_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["supervisor-team", userId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["orders-counts"] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [subscribe, isSupervisor, userId, queryClient]);
  return useMemo(() => {
    const ids = new Set(query.data?.ids ?? []);
    const names = new Set(query.data?.names ?? []);
    const driverIds = new Set(query.data?.driverIds ?? []);
    return { isSupervisor, ids, names, driverIds,
      cacheScope: isSupervisor ? JSON.stringify([userId, [...ids].sort(), [...names].sort(), [...driverIds].sort()]) : null,
      ready: !isSupervisor || !!query.data,
      includesBooker: (booker?: string | null) => teamIncludesBooker(ids, names, booker),
      includesOrder: (order: TeamOrder) => teamIncludesOrder(ids, names, driverIds, order),
    };
  }, [isSupervisor, userId, query.data]);
}
