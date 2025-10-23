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
    refetchInterval: 120000, // Refetch every 2 minutes (reduced from 1 minute to save Disk IO)
    staleTime: 90000, // Consider data stale after 90 seconds
  });
};
