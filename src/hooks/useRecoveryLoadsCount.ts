import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

export const useRecoveryLoadsCount = () => {
  const { profile } = useAuthContext();
  const fullName = profile?.full_name || null;

  return useQuery({
    queryKey: ["recovery-loads-count", fullName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("booked_by")
        .eq("retrieval", true);

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
    staleTime: 120000,
    refetchInterval: 120000,
    retry: false,
  });
};
