import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, CheckCircle2, FileText, Check } from "lucide-react";
import { useLumperMissingRevisedRC } from "@/hooks/useLumperMissingRevisedRC";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function LumperMissingRevisedRCPanel() {
  const { toast } = useToast();
  const { 
    lumperRequests, 
    isLoading, 
    uploadRevisedRC, 
    isUploading,
  } = useLumperMissingRevisedRC();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const handleFileChange = async (requestId: string, file: File | undefined) => {
    if (!file) return;

    setUploadingId(requestId);
    try {
      await uploadRevisedRC({ requestId, file });
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Lumper - Missing Revised RC
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (lumperRequests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Lumper - Missing Revised RC
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            All lumper requests have revised rate confirmations uploaded.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-500" />
          Lumper - Missing Revised RC
          <Badge variant="secondary" className="ml-2">{lumperRequests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Truck</TableHead>
              <TableHead>Driver</TableHead>
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
                <TableCell>{req.driver_name}</TableCell>
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
  );
}
