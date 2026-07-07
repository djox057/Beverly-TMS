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
  requested_by?: string | null;
}

export function useEfsMissingReceipts() {
  const queryClient = useQueryClient();

  // Fetch Fuel requests missing receipt OR gallons
  const { data: fuelRequests = [], isLoading, refetch } = useQuery({
    queryKey: ["efs-fuel-missing-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, driver_name, truck_number, amount, requested_at, city, state, quantity, receipt_path, requested_by")
        .eq("purpose", "Fuel")
        .eq("receipt_bypassed", false)
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
      // First get the EFS request details to create fuel transaction
      const { data: efsRequest, error: fetchError } = await supabase
        .from("efs_other_requests")
        .select("driver_name, truck_number, amount, city, state, company_name, requested_at")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      // Update the quantity in efs_other_requests
      const { error } = await supabase
        .from("efs_other_requests")
        .update({ quantity })
        .eq("id", requestId);

      if (error) throw error;

      // Create fuel transaction if it doesn't exist
      // Check if a fuel transaction already exists for this EFS request
      const transactionNumber = `EFS-APP-${requestId.substring(0, 8)}`;
      const { data: existingTx } = await supabase
        .from("fuel_transactions")
        .select("id")
        .eq("transaction_number", transactionNumber)
        .maybeSingle();

      if (!existingTx && efsRequest) {
        const unitPrice = quantity > 0 ? efsRequest.amount / quantity : 0;
        const transactionDate = new Date(efsRequest.requested_at).toISOString().split('T')[0];

        await supabase.from("fuel_transactions").insert({
          truck_number: efsRequest.truck_number,
          driver_name: efsRequest.driver_name,
          transaction_number: transactionNumber,
          transaction_date: transactionDate,
          location_name: "EFS Request",
          city: efsRequest.city,
          state: efsRequest.state?.toUpperCase() || null,
          fees: 0,
          item: "ULSD",
          unit_price: unitPrice,
          quantity: quantity,
          amount: efsRequest.amount,
          company: efsRequest.company_name,
          paid: false,
        });
      }
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
    bypassReceipt: bypassMutation.mutateAsync,
    isBypassing: bypassMutation.isPending,
  };
}
