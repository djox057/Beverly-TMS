import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DriverPerformanceData {
  driver_name: string;
  gross_tier: string;
  safety_tier: string;
  management_tier: string;
  notice: string;
}

export const useDriverPerformance = () => {
  const queryClient = useQueryClient();

  const { data: performanceData = {}, isLoading } = useQuery({
    queryKey: ['driver-performance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_performance')
        .select('*');
      
      if (error) throw error;
      
      // Convert array to object keyed by driver_name
      return (data || []).reduce((acc, item) => {
        acc[item.driver_name] = {
          grossTier: item.gross_tier,
          safetyTier: item.safety_tier,
          managementTier: item.management_tier,
          notice: item.notice || ''
        };
        return acc;
      }, {} as Record<string, { grossTier: string; safetyTier: string; managementTier: string; notice: string }>);
    },
  });

  const updatePerformance = useMutation({
    mutationFn: async (data: DriverPerformanceData) => {
      const { error } = await supabase
        .from('driver_performance')
        .upsert({
          driver_name: data.driver_name,
          gross_tier: data.gross_tier,
          safety_tier: data.safety_tier,
          management_tier: data.management_tier,
          notice: data.notice
        }, {
          onConflict: 'driver_name'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-performance'] });
      toast.success("Driver performance data saved");
    },
    onError: (error) => {
      console.error('Error saving driver performance:', error);
      toast.error("Failed to save driver performance data");
    },
  });

  return {
    performanceData,
    isLoading,
    updatePerformance: updatePerformance.mutate,
  };
};
