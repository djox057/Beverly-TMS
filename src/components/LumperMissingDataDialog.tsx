import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";


interface LumperMissingDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
}

interface LumperOrder {
  id: string;
  internal_load_number: number | null;
  truck_number: string | null;
  lumper: number;
  pickup_datetime: string | null;
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

  // Fetch orders with lumper missing revised RC for this specific driver
  const { data: lumperOrders = [], isLoading } = useQuery({
    queryKey: ["lumper-missing-revised-rc-driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          internal_load_number,
          lumper,
          pickup_datetime,
          lumper_revised_rc_path,
          truck:trucks!orders_truck_id_fkey(truck_number)
        `)
        .gt("lumper", 0)
        .is("lumper_revised_rc_path", null)
        .or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`)
        .order("pickup_datetime", { ascending: false });

      if (error) throw error;
      
      return (data || []).map((order) => ({
        id: order.id,
        internal_load_number: order.internal_load_number,
        truck_number: (order.truck as any)?.truck_number || null,
        lumper: order.lumper || 0,
        pickup_datetime: order.pickup_datetime,
      })) as LumperOrder[];
    },
    enabled: open && !!driverId,
    staleTime: 30 * 1000,
  });

  const uploadRevisedRCMutation = useMutation({
    mutationFn: async ({ orderId, file }: { orderId: string; file: File }) => {
      const fileExt = file.name.split(".").pop();
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
      queryClient.invalidateQueries({ queryKey: ["lumper-missing-revised-rc-driver", driverId] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Lumper - Missing Revised RC for {driverName}
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
                <TableHead>Truck</TableHead>
                <TableHead className="text-right">Lumper</TableHead>
                <TableHead>Pickup Date</TableHead>
                <TableHead className="text-center">Revised RC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lumperOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    #{order.internal_load_number || "—"}
                  </TableCell>
                  <TableCell>{order.truck_number || "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    ${order.lumper.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.pickup_datetime 
                      ? format(new Date(order.pickup_datetime), "MMM d, h:mm a")
                      : "—"
                    }
                  </TableCell>
                  <TableCell className="text-center">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      ref={(el) => (fileInputRefs.current[order.id] = el)}
                      onChange={(e) => handleFileChange(order.id, e.target.files?.[0])}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploadRevisedRCMutation.isPending && uploadingId === order.id}
                      onClick={() => fileInputRefs.current[order.id]?.click()}
                    >
                      {uploadRevisedRCMutation.isPending && uploadingId === order.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-1" />
                          Upload
                        </>
                      )}
                    </Button>
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
