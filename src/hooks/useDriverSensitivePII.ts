import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

export const useDriverSensitivePII = (driverId?: string) => {
  const { hasRole } = useAuthContext();
  const canViewSensitiveData = hasRole('manager') || hasRole('admin') || hasRole('supervisor') || hasRole('accounting') || hasRole('chicago_management');

  return useQuery({
    queryKey: ['driver-sensitive-pii', driverId],
    queryFn: async () => {
      if (!driverId) return null;

      const { data, error } = await supabase
        .from('driver_sensitive_pii')
        .select('*')
        .eq('driver_id', driverId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!driverId && canViewSensitiveData,
  });
};
