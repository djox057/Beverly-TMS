import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadOrderFilePreserveName } from "@/utils/orderFilesUpload";

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
 * Checks lumper_revised_rc_path column OR multiple RC files (indicating a revised RC was uploaded)
 */
export function useLumperMissingRevisedRC() {
  const queryClient = useQueryClient();

  // Fetch orders with lumper > 0 that are missing revised RC
  const { data: lumperRequests = [], isLoading, refetch } = useQuery({
    queryKey: ["lumper-missing-revised-rc"],
    queryFn: async () => {
      // Fetch all orders with lumper > 0, including order_files to check for RC uploads
      // Only check orders created on/after January 9, 2026
      // Don't filter by lumper_revised_rc_path since file might be deleted
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          internal_load_number,
          lumper,
          pickup_datetime,
          driver1_id,
          driver2_id,
          driver1:drivers!orders_driver1_id_fkey(id, name),
          driver2:drivers!orders_driver2_id_fkey(id, name),
          truck:trucks!orders_truck_id_fkey(truck_number),
          order_files(id, file_category, file_name)
        `)
        .gt("lumper", 0)
        .gte("created_at", "2026-01-09T00:00:00Z")
        .order("pickup_datetime", { ascending: false });

      if (error) throw error;
      
      // Filter to only include orders that are truly missing revised RC
      // An order is complete if EITHER:
      // - Has 2+ RC files (original + revised), OR
      // - Has at least 1 file in "ADDITIONAL" category
      const ordersWithMissingRC = (data || []).filter((order) => {
        const orderFiles = order.order_files || [];
        const rcFileCount = orderFiles.filter((file: any) => file.file_category === "RC").length;
        const hasAdditionalFile = orderFiles.some((file: any) => file.file_category === "ADDITIONAL");
        // Complete if has 2+ RC files OR has an additional file
        return rcFileCount < 2 && !hasAdditionalFile;
      });
      
      return ordersWithMissingRC.map((order) => ({
        id: order.id,
        driver1_id: order.driver1_id,
        driver1_name: (order.driver1 as any)?.name || "Unknown",
        driver2_id: order.driver2_id,
        driver2_name: (order.driver2 as any)?.name || null,
        truck_number: (order.truck as any)?.truck_number || null,
        internal_load_number: order.internal_load_number,
        lumper: order.lumper || 0,
        pickup_datetime: order.pickup_datetime,
        lumper_revised_rc_path: null, // Not fetched anymore, rely on RC file count
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

      // Save to order-files storage with additional category path
      const storagePath = await uploadOrderFilePreserveName({
        orderId,
        folder: "additional",
        file,
      });

      // Save to order_files table with "additional" category
      const { error: fileRecordError } = await supabase
        .from("order_files")
        .insert({
          order_id: orderId,
          file_name: file.name,
          file_path: storagePath,
          file_size: file.size,
          content_type: file.type,
          file_category: "ADDITIONAL",
        });

      if (fileRecordError) throw fileRecordError;

      // Also update lumper_revised_rc_path on the order for backwards compatibility
      const { error: updateError } = await supabase
        .from("orders")
        .update({ lumper_revised_rc_path: storagePath })
        .eq("id", orderId);

      if (updateError) throw updateError;

      return storagePath;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lumper-missing-revised-rc"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      // Real-time subscription will update orders cache
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
