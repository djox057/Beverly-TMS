import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

/** Dispatcher's own trucks missing pre-trip photos for the latest Monday/Friday. */
// Flip to true to re-show the Pre Trip Inspection menu item (and its red count) for dispatchers.
const DISPATCHER_PRETRIP_VISIBLE = false;

export const usePretripMissingCount = () => {
  const { getPrimaryRole, profile } = useAuthContext();
  const isDispatcher = getPrimaryRole() === "dispatch";
  return useQuery({
    queryKey: ["pretrip-missing-count", profile?.user_id],
    enabled: DISPATCHER_PRETRIP_VISIBLE && isDispatcher && !!profile?.user_id,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_pretrip_missing_count");
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
};
