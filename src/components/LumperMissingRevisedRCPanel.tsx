import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, CheckCircle2, FileText } from "lucide-react";
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

  const handleFileChange = async (orderId: string, file: File | undefined) => {
    if (!file) return;

    setUploadingId(orderId);
    try {
      await uploadRevisedRC({ orderId, file });
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
            Lumper - Missing Receipt
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
            Lumper - Missing Receipt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            All orders with lumper have revised rate confirmations uploaded.
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
          Lumper - Missing Receipt
          <Badge variant="secondary" className="ml-2">{lumperRequests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Load #</TableHead>
              <TableHead>Truck</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Lumper</TableHead>
              <TableHead>Pickup Date</TableHead>
              <TableHead className="text-center">Revised RC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lumperRequests.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  #{order.internal_load_number || "—"}
                </TableCell>
                <TableCell>{order.truck_number || "—"}</TableCell>
                <TableCell>
                  {order.driver1_name}
                  {order.driver2_name && ` / ${order.driver2_name}`}
                </TableCell>
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
                    disabled={isUploading && uploadingId === order.id}
                    onClick={() => fileInputRefs.current[order.id]?.click()}
                  >
                    {isUploading && uploadingId === order.id ? (
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
