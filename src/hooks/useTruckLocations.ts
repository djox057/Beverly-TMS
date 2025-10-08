import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export const useTruckLocations = () => {
  return useQuery({
    queryKey: ['truck-locations'],
    queryFn: async () => {
      // Call the database function to get latest locations
      const { data, error } = await supabase
        .rpc('get_latest_truck_locations');
      
      if (error) {
        console.error('Error fetching truck locations:', error);
        throw error;
      }
      
      // Transform to match expected interface
      const locations: TruckLocation[] = (data || []).map((loc: any) => ({
        truck_id: loc.truck_id,
        truck_number: loc.truck_number,
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
        timestamp: loc.location_timestamp,
      }));
      
      console.log('📍 Fetched truck locations from database:', locations.length);
      
      return locations;
    },
    refetchInterval: 10000, // Refetch every 10 seconds (data is fresh from webhooks)
    staleTime: 5000, // Consider data stale after 5 seconds
  });
};
