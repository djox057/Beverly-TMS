import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EfsRequestWithMissingData {
  id: string;
  driver_name: string;
  truck_number: string;
  amount: number;
  purpose: string;
  requested_at: string;
  city?: string | null;
  state?: string | null;
  quantity?: number | null;
  receipt_path?: string | null;
}

export function useEfsMissingReceipts() {
  const queryClient = useQueryClient();

  // Fetch requests missing receipts
  const { data: receiptsRequests = [], isLoading: isLoadingReceipts, refetch: refetchReceipts } = useQuery({
    queryKey: ["efs-missing-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, driver_name, truck_number, amount, purpose, requested_at, city, state, quantity, receipt_path")
        .is("receipt_path", null)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data as EfsRequestWithMissingData[];
    },
    staleTime: 30 * 1000,
  });

  // Fetch requests missing gallons (for fuel purpose only)
  const { data: gallonsRequests = [], isLoading: isLoadingGallons, refetch: refetchGallons } = useQuery({
    queryKey: ["efs-missing-gallons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, driver_name, truck_number, amount, purpose, requested_at, city, state, quantity, receipt_path")
        .eq("purpose", "Fuel")
        .is("quantity", null)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data as EfsRequestWithMissingData[];
    },
    staleTime: 30 * 1000,
  });

  const uploadReceiptMutation = useMutation({
    mutationFn: async ({ requestId, file }: { requestId: string; file: File }) => {
      const { data: request, error: fetchError } = await supabase
        .from("efs_other_requests")
        .select("driver_id")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      const fileExt = file.name.split(".").pop();
      const driverId = request?.driver_id || "unknown";
      const fileName = `${driverId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("efs-receipts")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

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

  const updateGallonsMutation = useMutation({
    mutationFn: async ({ requestId, quantity }: { requestId: string; quantity: number }) => {
      const { error } = await supabase
        .from("efs_other_requests")
        .update({ quantity })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["efs-missing-gallons"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
    },
  });

  return {
    // Receipts
    requests: receiptsRequests,
    isLoading: isLoadingReceipts,
    refetch: refetchReceipts,
    uploadReceipt: uploadReceiptMutation.mutateAsync,
    isUploading: uploadReceiptMutation.isPending,
    // Gallons
    gallonsRequests,
    isLoadingGallons,
    refetchGallons,
    updateGallons: updateGallonsMutation.mutateAsync,
    isUpdatingGallons: updateGallonsMutation.isPending,
  };
}
