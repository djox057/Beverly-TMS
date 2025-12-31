import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EfsFuelMissingData {
  id: string;
  driver_name: string;
  truck_number: string;
  amount: number;
  requested_at: string;
  city?: string | null;
  state?: string | null;
  quantity?: number | null;
  receipt_path?: string | null;
}

export function useEfsMissingReceipts() {
  const queryClient = useQueryClient();

  // Fetch Fuel requests missing receipt OR gallons
  const { data: fuelRequests = [], isLoading, refetch } = useQuery({
    queryKey: ["efs-fuel-missing-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, driver_name, truck_number, amount, requested_at, city, state, quantity, receipt_path")
        .eq("purpose", "Fuel")
        .or("receipt_path.is.null,quantity.is.null")
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data as EfsFuelMissingData[];
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
      queryClient.invalidateQueries({ queryKey: ["efs-fuel-missing-data"] });
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
      queryClient.invalidateQueries({ queryKey: ["efs-fuel-missing-data"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
    },
  });

  return {
    fuelRequests,
    isLoading,
    refetch,
    uploadReceipt: uploadReceiptMutation.mutateAsync,
    isUploading: uploadReceiptMutation.isPending,
    updateGallons: updateGallonsMutation.mutateAsync,
    isUpdatingGallons: updateGallonsMutation.isPending,
  };
}
