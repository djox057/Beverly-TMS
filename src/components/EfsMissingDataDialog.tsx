import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface EfsMissingDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
}

interface EfsFuelRequest {
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

export function EfsMissingDataDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
}: EfsMissingDataDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [gallonsInputs, setGallonsInputs] = useState<Record<string, string>>({});
  const [updatingGallonsId, setUpdatingGallonsId] = useState<string | null>(null);

  // Fetch missing EFS fuel data for this specific driver
  const { data: fuelRequests = [], isLoading } = useQuery({
    queryKey: ["efs-fuel-missing-data-driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, driver_name, truck_number, amount, requested_at, city, state, quantity, receipt_path, requested_by")
        .eq("purpose", "Fuel")
        .eq("driver_id", driverId)
        .or("receipt_path.is.null,quantity.is.null")
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data as EfsFuelRequest[];
    },
    enabled: open && !!driverId,
    staleTime: 30 * 1000,
  });

  const uploadReceiptMutation = useMutation({
    mutationFn: async ({ requestId, file }: { requestId: string; file: File }) => {
      const fileExt = file.name.split(".").pop();
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
      queryClient.invalidateQueries({ queryKey: ["efs-fuel-missing-data-driver", driverId] });
      queryClient.invalidateQueries({ queryKey: ["efs-missing-by-driver"] });
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
      queryClient.invalidateQueries({ queryKey: ["efs-fuel-missing-data-driver", driverId] });
      queryClient.invalidateQueries({ queryKey: ["efs-missing-by-driver"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
    },
  });

  const handleFileChange = async (requestId: string, file: File | undefined) => {
    if (!file) return;

    setUploadingId(requestId);
    try {
      await uploadReceiptMutation.mutateAsync({ requestId, file });
      toast({
        title: "Receipt uploaded",
        description: "The receipt has been uploaded successfully.",
      });
    } catch (error) {
      console.error("Failed to upload receipt:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload receipt",
        variant: "destructive",
      });
    } finally {
      setUploadingId(null);
    }
  };

  const handleGallonsUpdate = async (requestId: string) => {
    const quantity = parseFloat(gallonsInputs[requestId] || "");
    if (isNaN(quantity) || quantity <= 0) {
      toast({
        title: "Invalid quantity",
        description: "Please enter a valid number of gallons.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingGallonsId(requestId);
    try {
      await updateGallonsMutation.mutateAsync({ requestId, quantity });
      toast({
        title: "Gallons updated",
        description: `${quantity} gallons recorded successfully.`,
      });
      setGallonsInputs((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    } catch (error) {
      console.error("Failed to update gallons:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update gallons",
        variant: "destructive",
      });
    } finally {
      setUpdatingGallonsId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            EFS Fuel - Missing Data for {driverName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : fuelRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No missing EFS fuel data for this driver.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Truck</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead className="text-center">Gallons</TableHead>
                <TableHead className="text-center">Receipt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fuelRequests.map((req) => {
                const hasGallons = req.quantity != null;
                const hasReceipt = req.receipt_path != null;

                return (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.truck_number}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${req.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {req.city && req.state ? `${req.city}, ${req.state}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(req.requested_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {req.requested_by || "—"}
                    </TableCell>
                    <TableCell>
                      {hasGallons ? (
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <Check className="h-4 w-4" />
                          <span>{req.quantity}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 justify-center">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="Gallons"
                            className="w-24 h-8 text-sm"
                            value={gallonsInputs[req.id] || ""}
                            onChange={(e) =>
                              setGallonsInputs((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateGallonsMutation.isPending && updatingGallonsId === req.id}
                            onClick={() => handleGallonsUpdate(req.id)}
                          >
                            {updateGallonsMutation.isPending && updatingGallonsId === req.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {hasReceipt ? (
                        <div className="flex items-center justify-center text-green-600">
                          <Check className="h-4 w-4" />
                        </div>
                      ) : (
                        <>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(el) => (fileInputRefs.current[req.id] = el)}
                            onChange={(e) => handleFileChange(req.id, e.target.files?.[0])}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={uploadReceiptMutation.isPending && uploadingId === req.id}
                            onClick={() => fileInputRefs.current[req.id]?.click()}
                          >
                            {uploadReceiptMutation.isPending && uploadingId === req.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-1" />
                                Upload
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
