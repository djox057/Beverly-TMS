import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTrailers = () => {
  return useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trailers')
        .select('*')
        .order('trailer_number', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });
};