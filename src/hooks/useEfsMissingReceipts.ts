import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EfsRequestWithMissingReceipt {
  id: string;
  driver_name: string;
  truck_number: string;
  amount: number;
  purpose: string;
  requested_at: string;
  city?: string | null;
  state?: string | null;
  quantity?: number | null;
}

export function useEfsMissingReceipts() {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ["efs-missing-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, driver_name, truck_number, amount, purpose, requested_at, city, state, quantity")
        .is("receipt_path", null)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data as EfsRequestWithMissingReceipt[];
    },
    staleTime: 30 * 1000,
  });

  const uploadReceiptMutation = useMutation({
    mutationFn: async ({ requestId, file }: { requestId: string; file: File }) => {
      // Get the driver_id from the request to organize files
      const { data: request, error: fetchError } = await supabase
        .from("efs_other_requests")
        .select("driver_id")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      const fileExt = file.name.split(".").pop();
      const driverId = request?.driver_id || "unknown";
      const fileName = `${driverId}/${Date.now()}.${fileExt}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("efs-receipts")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Update the record with the receipt path
      const { error: updateError } = await supabase
        .from("efs_other_requests")
        .update({ receipt_path: fileName })
        .eq("id", requestId);

      if (updateError) throw updateError;

      return fileName;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["efs-missing-receipts"] });
    },
  });

  return {
    requests,
    isLoading,
    refetch,
    uploadReceipt: uploadReceiptMutation.mutateAsync,
    isUploading: uploadReceiptMutation.isPending,
  };
}
