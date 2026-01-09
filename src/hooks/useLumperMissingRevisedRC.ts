import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LumperMissingRevisedRC {
  id: string;
  driver1_id: string | null;
  driver1_name: string;
  driver2_id: string | null;
  driver2_name: string | null;
  truck_number: string | null;
  internal_load_number: number | null;
  lumper: number;
  pickup_datetime: string | null;
  lumper_revised_rc_path: string | null;
}

/**
 * Hook to get orders with lumper that are missing revised rate confirmation
 */
export function useLumperMissingRevisedRC() {
  const queryClient = useQueryClient();

  // Fetch orders with lumper > 0 that are missing revised RC
  const { data: lumperRequests = [], isLoading, refetch } = useQuery({
    queryKey: ["lumper-missing-revised-rc"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          internal_load_number,
          lumper,
          pickup_datetime,
          lumper_revised_rc_path,
          driver1_id,
          driver2_id,
          driver1:drivers!orders_driver1_id_fkey(id, name),
          driver2:drivers!orders_driver2_id_fkey(id, name),
          truck:trucks!orders_truck_id_fkey(truck_number)
        `)
        .gt("lumper", 0)
        .is("lumper_revised_rc_path", null)
        .order("pickup_datetime", { ascending: false });

      if (error) throw error;
      
      return (data || []).map((order) => ({
        id: order.id,
        driver1_id: order.driver1_id,
        driver1_name: (order.driver1 as any)?.name || "Unknown",
        driver2_id: order.driver2_id,
        driver2_name: (order.driver2 as any)?.name || null,
        truck_number: (order.truck as any)?.truck_number || null,
        internal_load_number: order.internal_load_number,
        lumper: order.lumper || 0,
        pickup_datetime: order.pickup_datetime,
        lumper_revised_rc_path: order.lumper_revised_rc_path,
      })) as LumperMissingRevisedRC[];
    },
    staleTime: 30 * 1000,
  });

  // Get set of driver IDs with missing revised RC
  const driverIdsWithMissingRevisedRC = new Set<string>(
    lumperRequests.flatMap(r => [r.driver1_id, r.driver2_id].filter(Boolean) as string[])
  );

  const uploadRevisedRCMutation = useMutation({
    mutationFn: async ({ orderId, file }: { orderId: string; file: File }) => {
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("driver1_id")
        .eq("id", orderId)
        .single();

      if (fetchError) throw fetchError;

      const fileExt = file.name.split(".").pop();
      const driverId = order?.driver1_id || "unknown";
      const fileName = `lumper-revised-rc/${driverId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("order-files")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("orders")
        .update({ lumper_revised_rc_path: fileName })
        .eq("id", orderId);

      if (updateError) throw updateError;

      return fileName;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lumper-missing-revised-rc"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  return {
    lumperRequests,
    isLoading,
    refetch,
    driverIdsWithMissingRevisedRC,
    hasDriverMissingRevisedRC: (driverId: string | null | undefined) => {
      if (!driverId) return false;
      return driverIdsWithMissingRevisedRC.has(driverId);
    },
    uploadRevisedRC: uploadRevisedRCMutation.mutateAsync,
    isUploading: uploadRevisedRCMutation.isPending,
  };
}
