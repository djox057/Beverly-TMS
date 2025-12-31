import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, CheckCircle2, Fuel, Check } from "lucide-react";
import { useEfsMissingReceipts } from "@/hooks/useEfsMissingReceipts";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function EfsMissingReceiptsPanel() {
  const { toast } = useToast();
  const { 
    fuelRequests, 
    isLoading, 
    uploadReceipt, 
    isUploading,
    updateGallons,
    isUpdatingGallons,
  } = useEfsMissingReceipts();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [gallonsInputs, setGallonsInputs] = useState<Record<string, string>>({});
  const [updatingGallonsId, setUpdatingGallonsId] = useState<string | null>(null);

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

  if (isLoading) {
    return (
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
    );
  }

  if (fuelRequests.length === 0) {
    return (
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
    );
  }

  return (
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
