import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface YardLoad {
  id: string;
  order_id: string | null;
  trailer_number: string | null;
  internal_load_number: string | null;
  delivery_date: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  truck_number: string | null;
  driver_name: string | null;
  broker_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useYardLoadsTable = () => {
  return useQuery({
    queryKey: ['yard-loads-table'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('yard_loads')
        .select('*')
        .order('delivery_date', { ascending: true });

      if (error) throw error;
      return data as YardLoad[];
    },
  });
};
