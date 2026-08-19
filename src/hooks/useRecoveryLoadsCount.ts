import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

export const useRecoveryLoadsCount = () => {
  const { profile } = useAuthContext();
  const fullName = profile?.full_name || null;
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`recovery-loads-count-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recovery-loads-count"] });
          queryClient.invalidateQueries({ queryKey: ["recovery-loads"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const query = useQuery({
    queryKey: ["recovery-loads-count", fullName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("booked_by")
        .eq("retrieval", true)
        .eq("canceled", false);

      if (error) {
        console.error("Error fetching recovery loads count:", error);
        throw error;
      }

      const rows = data || [];
      const hasMine = fullName
        ? rows.some((r: any) => (r.booked_by || "").trim().toLowerCase() === fullName.trim().toLowerCase())
        : false;

      return { count: rows.length, hasMine };
    },
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  return query;
};
