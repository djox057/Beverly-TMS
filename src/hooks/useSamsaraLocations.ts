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
    refetchInterval: 15 * 60 * 1000, // Refresh every 15 minutes (reduced from 5 min to lower invocations)
    staleTime: 14 * 60 * 1000, // Consider data fresh for 14 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    refetchOnReconnect: false, // Don't refetch on reconnect
  });
};
