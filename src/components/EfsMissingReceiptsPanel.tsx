import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, HelpCircle, CheckCircle2, Fuel } from "lucide-react";
import { useEfsMissingReceipts } from "@/hooks/useEfsMissingReceipts";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function EfsMissingReceiptsPanel() {
  const { toast } = useToast();
  const { 
    requests, 
    isLoading, 
    uploadReceipt, 
    isUploading,
    gallonsRequests,
    isLoadingGallons,
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

  const isLoadingAny = isLoading || isLoadingGallons;

  if (isLoadingAny) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-amber-500" />
            EFS Missing Data
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasNoMissingData = requests.length === 0 && gallonsRequests.length === 0;

  if (hasNoMissingData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            EFS Missing Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            All EFS requests have complete data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Missing Receipts Section */}
      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-amber-500" />
              Missing Receipts
              <Badge variant="secondary" className="ml-2">{requests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1">
                        <HelpCircle className="h-4 w-4 text-amber-500" />
                        {req.truck_number}
                      </span>
                    </TableCell>
                    <TableCell>{req.driver_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{req.purpose}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${req.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {req.city && req.state ? `${req.city}, ${req.state}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(req.requested_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell className="text-center">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Missing Gallons Section */}
      {gallonsRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5 text-amber-500" />
              Missing Gallons
              <Badge variant="secondary" className="ml-2">{gallonsRequests.length}</Badge>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {gallonsRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1">
                        <Fuel className="h-4 w-4 text-amber-500" />
                        {req.truck_number}
                      </span>
                    </TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
