import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LumperMissingDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
}

interface LumperOrder {
  id: string;
  internal_load_number: number | null;
  broker_load_number: string | null;
  lumper: number;
}

export function LumperMissingDataDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
}: LumperMissingDataDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Fetch orders with lumper missing revised RC for this specific driver
  const { data: lumperOrders = [], isLoading } = useQuery({
    queryKey: ["lumper-missing-revised-rc-driver", driverId],
    queryFn: async () => {
      // Fetch all orders with lumper > 0 (don't filter by lumper_revised_rc_path since file might be deleted)
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          internal_load_number,
          broker_load_number,
          lumper,
          order_files(id, file_category)
        `)
        .gt("lumper", 0)
        .gte("created_at", "2026-01-09T00:00:00Z")
        .or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`)
        .order("pickup_datetime", { ascending: false });

      if (error) throw error;
      
      // Filter orders missing revised RC - need 2+ RC files to be considered complete
      const ordersWithMissingRC = (data || []).filter((order) => {
        const orderFiles = order.order_files || [];
        const rcFileCount = orderFiles.filter((file: any) => file.file_category === "RC").length;
        // Need at least 2 RC files (original + revised) to be complete
        return rcFileCount < 2;
      });
      
      return ordersWithMissingRC.map((order) => ({
        id: order.id,
        internal_load_number: order.internal_load_number,
        broker_load_number: order.broker_load_number,
        lumper: order.lumper || 0,
      })) as LumperOrder[];
    },
    enabled: open && !!driverId,
    staleTime: 30 * 1000,
  });

  const uploadRevisedRCMutation = useMutation({
    mutationFn: async ({ orderId, file }: { orderId: string; file: File }) => {
      const fileExt = file.name.split(".").pop();
      const storagePath = `${orderId}/additional/${Date.now()}_lumper-revised-rc.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("order-files")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Save to order_files table with "additional" category
      const { error: fileRecordError } = await supabase
        .from("order_files")
        .insert({
          order_id: orderId,
          file_name: `lumper-revised-rc.${fileExt}`,
          file_path: storagePath,
          file_size: file.size,
          content_type: file.type,
          file_category: "ADDITIONAL",
        });

      if (fileRecordError) throw fileRecordError;

      const { error: updateError } = await supabase
        .from("orders")
        .update({ lumper_revised_rc_path: storagePath })
        .eq("id", orderId);

      if (updateError) throw updateError;

      return storagePath;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lumper-missing-revised-rc"] });
      queryClient.invalidateQueries({ queryKey: ["lumper-missing-revised-rc-driver", driverId] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const handleFileChange = async (orderId: string, file: File | undefined) => {
    if (!file) return;

    setUploadingId(orderId);
    try {
      await uploadRevisedRCMutation.mutateAsync({ orderId, file });
      toast({
        title: "Revised RC uploaded",
        description: "The revised rate confirmation has been uploaded successfully.",
      });
    } catch (error) {
      console.error("Failed to upload revised RC:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload revised RC",
        variant: "destructive",
      });
    } finally {
      setUploadingId(null);
    }
  };

  const handleDragOver = (e: React.DragEvent, orderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(orderId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, orderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileChange(orderId, files[0]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Lumper - Missing Receipt for {driverName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : lumperOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No missing revised rate confirmations for this driver.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Load #</TableHead>
                <TableHead>Broker Load #</TableHead>
                <TableHead className="text-right">Lumper</TableHead>
                <TableHead className="text-center">Revised RC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lumperOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    #{order.internal_load_number || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.broker_load_number || "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${order.lumper.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      ref={(el) => (fileInputRefs.current[order.id] = el)}
                      onChange={(e) => handleFileChange(order.id, e.target.files?.[0])}
                    />
                    <div
                      onClick={() => !uploadingId && fileInputRefs.current[order.id]?.click()}
                      onDragOver={(e) => handleDragOver(e, order.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, order.id)}
                      className={cn(
                        "flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed cursor-pointer transition-colors text-sm",
                        dragOverId === order.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50 text-muted-foreground",
                        uploadingId === order.id && "pointer-events-none opacity-50"
                      )}
                    >
                      {uploadingId === order.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          <span>Drop or click</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
