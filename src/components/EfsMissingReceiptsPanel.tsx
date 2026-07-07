import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, CheckCircle2, Fuel, Check, CheckCheck } from "lucide-react";
import { useEfsMissingReceipts } from "@/hooks/useEfsMissingReceipts";
import { LumperMissingRevisedRCPanel } from "@/components/LumperMissingRevisedRCPanel";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

export function EfsMissingReceiptsPanel() {
  const { toast } = useToast();
  const { hasRole } = useAuthContext();
  const canBypass = hasRole("admin") || hasRole("manager") || hasRole("accounting");
  const { 
    fuelRequests, 
    isLoading, 
    uploadReceipt, 
    isUploading,
    updateGallons,
    isUpdatingGallons,
    bypassReceipt,
    isBypassing,
  } = useEfsMissingReceipts();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [gallonsInputs, setGallonsInputs] = useState<Record<string, string>>({});
  const [updatingGallonsId, setUpdatingGallonsId] = useState<string | null>(null);
  const [bypassingId, setBypassingId] = useState<string | null>(null);

  const handleBypass = async (requestId: string) => {
    setBypassingId(requestId);
    try {
      await bypassReceipt({ requestId });
      toast({ title: "Marked as complete" });
    } catch (error) {
      toast({
        title: "Failed",
        description: error instanceof Error ? error.message : "Failed to mark as complete",
        variant: "destructive",
      });
    } finally {
      setBypassingId(null);
    }
  };

  const handleFileChange = async (requestId: string, file: File | undefined) => {
    if (!file) return;

    setUploadingId(requestId);
    try {
      await uploadReceipt({ requestId, file });
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
      await updateGallons({ requestId, quantity });
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
    <div className="space-y-6">
      {/* Lumper Missing Revised RC Panel */}
      <LumperMissingRevisedRCPanel />

      {/* EFS Fuel Missing Data Panel */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5 text-amber-500" />
              EFS Fuel - Missing Data
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : fuelRequests.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              EFS Fuel - Missing Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">
              All EFS fuel requests have complete data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5 text-amber-500" />
              EFS Fuel - Missing Data
              <Badge variant="secondary" className="ml-2">{fuelRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead className="text-center">Gallons</TableHead>
                  <TableHead className="text-center">Receipt</TableHead>
                  {canBypass && <TableHead className="text-center">Bypass</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fuelRequests.map((req) => {
                  const hasGallons = req.quantity != null;
                  const hasReceipt = req.receipt_path != null;
                  
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.truck_number}</TableCell>
                      <TableCell>{req.driver_name}</TableCell>
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
                              onChange={(e) => setGallonsInputs((prev) => ({ ...prev, [req.id]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isUpdatingGallons && updatingGallonsId === req.id}
                              onClick={() => handleGallonsUpdate(req.id)}
                            >
                              {isUpdatingGallons && updatingGallonsId === req.id ? (
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
                              disabled={isUploading && uploadingId === req.id}
                              onClick={() => fileInputRefs.current[req.id]?.click()}
                            >
                              {isUploading && uploadingId === req.id ? (
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
                      {canBypass && (
                        <TableCell className="text-center">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isBypassing && bypassingId === req.id}
                                title="Mark as complete"
                              >
                                {isBypassing && bypassingId === req.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCheck className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Mark as complete?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will hide the row without a receipt or gallons. Continue?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleBypass(req.id)}>
                                  Confirm
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
