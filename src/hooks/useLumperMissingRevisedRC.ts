import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LumperMissingRevisedRC {
  id: string;
  driver_id: string | null;
  driver_name: string;
  truck_number: string | null;
  amount: number;
  requested_at: string;
  requested_by: string | null;
  revised_rc_path: string | null;
}

/**
 * Hook to get lumper requests that are missing revised rate confirmation
 */
export function useLumperMissingRevisedRC() {
  const queryClient = useQueryClient();

  // Fetch Lumper requests missing revised RC
  const { data: lumperRequests = [], isLoading, refetch } = useQuery({
    queryKey: ["lumper-missing-revised-rc"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, driver_id, driver_name, truck_number, amount, requested_at, requested_by, revised_rc_path")
        .eq("purpose", "Lumper")
        .is("revised_rc_path", null)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data as LumperMissingRevisedRC[];
    },
    staleTime: 30 * 1000,
  });

  // Get set of driver IDs with missing revised RC
  const driverIdsWithMissingRevisedRC = new Set<string>(
    lumperRequests.filter(r => r.driver_id).map(r => r.driver_id!)
  );

  const uploadRevisedRCMutation = useMutation({
    mutationFn: async ({ requestId, file }: { requestId: string; file: File }) => {
      const { data: request, error: fetchError } = await supabase
        .from("efs_other_requests")
        .select("driver_id")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      const fileExt = file.name.split(".").pop();
      const driverId = request?.driver_id || "unknown";
      const fileName = `revised-rc/${driverId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("efs-receipts")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("efs_other_requests")
        .update({ revised_rc_path: fileName })
        .eq("id", requestId);

      if (updateError) throw updateError;

      return fileName;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lumper-missing-revised-rc"] });
      queryClient.invalidateQueries({ queryKey: ["efs-missing-by-driver"] });
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
