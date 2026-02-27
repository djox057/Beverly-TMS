import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export const useSamsaraLocations = () => {
  return useQuery({
    queryKey: ['samsara-locations'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('samsara-locations');
      
      if (error) {
        console.error('Error fetching Samsara locations:', error);
        throw error;
      }
      
      return data.locations as TruckLocation[];
    },
    enabled: true,
    refetchInterval: 20 * 60 * 1000, // Refresh every 20 minutes (server cache ensures 5-min freshness)
    staleTime: 19 * 60 * 1000, // Consider data fresh for 19 minutes
    gcTime: 45 * 60 * 1000, // Keep in cache for 45 minutes
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    refetchOnReconnect: false, // Don't refetch on reconnect
  });
};
