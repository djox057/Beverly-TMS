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
    enabled: true, // Re-enabled with optimizations
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes instead of constantly
    staleTime: 4 * 60 * 1000, // Consider data fresh for 4 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
};
