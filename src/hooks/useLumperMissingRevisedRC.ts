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
  internal_load_number: string | null;
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
      // Flat fetch - no joins to eliminate RLS amplification
      const { data, error } = await supabase
        .from("orders")
        .select("id, internal_load_number, lumper, pickup_datetime, driver1_id, driver2_id, truck_id")
        .gt("lumper", 0)
        .gte("created_at", "2026-01-09T00:00:00Z")
        .order("pickup_datetime", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [] as LumperMissingRevisedRC[];

      // Batch-fetch related entities
      const orderIds = data.map(o => o.id);
      const driverIds = [...new Set(data.flatMap(o => [o.driver1_id, o.driver2_id]).filter(Boolean))] as string[];
      const truckIds = [...new Set(data.map(o => o.truck_id).filter(Boolean))] as string[];

      const [driversRes, trucksRes, filesRes] = await Promise.all([
        driverIds.length > 0 ? supabase.from("drivers").select("id, name").in("id", driverIds) : { data: [] },
        truckIds.length > 0 ? supabase.from("trucks").select("id, truck_number").in("id", truckIds) : { data: [] },
        (async () => {
          let allFiles: { order_id: string; file_category: string }[] = [];
          // Batch orderIds to avoid huge URL query strings, and paginate per batch
          // since a single .in(...) result can exceed the 1000-row default.
          const ID_BATCH = 100;
          const PAGE_SIZE = 1000;
          for (let i = 0; i < orderIds.length; i += ID_BATCH) {
            const idBatch = orderIds.slice(i, i + ID_BATCH);
            let from = 0;
            while (true) {
              const { data, error } = await supabase
                .from("order_files")
                .select("order_id, file_category")
                .in("order_id", idBatch)
                .order("id", { ascending: true })
                .range(from, from + PAGE_SIZE - 1);
              if (error) throw error;
              allFiles = [...allFiles, ...(data || [])];
              if (!data || data.length < PAGE_SIZE) break;
              from += PAGE_SIZE;
            }
          }
          return { data: allFiles };
        })(),
      ]);

      const driverMap = new Map((driversRes.data || []).map((d: any) => [d.id, d]));
      const truckMap = new Map((trucksRes.data || []).map((t: any) => [t.id, t]));
      const filesByOrder = new Map<string, any[]>();
      for (const f of (filesRes.data || [])) {
        const arr = filesByOrder.get(f.order_id) || [];
        arr.push(f);
        filesByOrder.set(f.order_id, arr);
      }

      // Filter to only include orders that are truly missing revised RC
      const ordersWithMissingRC = data.filter((order) => {
        const orderFiles = filesByOrder.get(order.id) || [];
        const rcFileCount = orderFiles.filter((file: any) => file.file_category === "RC").length;
        const hasAdditionalFile = orderFiles.some((file: any) => file.file_category === "ADDITIONAL");
        return rcFileCount < 2 && !hasAdditionalFile;
      });

      return ordersWithMissingRC.map((order) => ({
        id: order.id,
        driver1_id: order.driver1_id,
        driver1_name: driverMap.get(order.driver1_id)?.name || "Unknown",
        driver2_id: order.driver2_id,
        driver2_name: driverMap.get(order.driver2_id)?.name || null,
        truck_number: truckMap.get(order.truck_id)?.truck_number || null,
        internal_load_number: order.internal_load_number,
        lumper: order.lumper || 0,
        pickup_datetime: order.pickup_datetime,
        lumper_revised_rc_path: null,
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
