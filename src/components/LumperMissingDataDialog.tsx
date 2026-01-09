import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, Check } from "lucide-react";
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

interface LumperRequest {
  id: string;
  driver_name: string;
  truck_number: string | null;
  amount: number;
  requested_at: string;
  requested_by: string | null;
  revised_rc_path: string | null;
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

  // Fetch missing lumper revised RC data for this specific driver
  const { data: lumperRequests = [], isLoading } = useQuery({
    queryKey: ["lumper-missing-revised-rc-driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, driver_name, truck_number, amount, requested_at, requested_by, revised_rc_path")
        .eq("purpose", "Lumper")
        .eq("driver_id", driverId)
        .is("revised_rc_path", null)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data as LumperRequest[];
    },
    enabled: open && !!driverId,
    staleTime: 30 * 1000,
  });

  const uploadRevisedRCMutation = useMutation({
    mutationFn: async ({ requestId, file }: { requestId: string; file: File }) => {
      const fileExt = file.name.split(".").pop();
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
      queryClient.invalidateQueries({ queryKey: ["lumper-missing-revised-rc-driver", driverId] });
    },
  });

  const handleFileChange = async (requestId: string, file: File | undefined) => {
    if (!file) return;

    setUploadingId(requestId);
    try {
      await uploadRevisedRCMutation.mutateAsync({ requestId, file });
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
        ) : lumperRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No missing revised rate confirmations for this driver.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Truck</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead className="text-center">Revised RC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lumperRequests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{req.truck_number || "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    ${req.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(req.requested_at), "MMM d, h:mm a")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {req.requested_by || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      ref={(el) => (fileInputRefs.current[req.id] = el)}
                      onChange={(e) => handleFileChange(req.id, e.target.files?.[0])}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploadRevisedRCMutation.isPending && uploadingId === req.id}
                      onClick={() => fileInputRefs.current[req.id]?.click()}
                    >
                      {uploadRevisedRCMutation.isPending && uploadingId === req.id ? (
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
