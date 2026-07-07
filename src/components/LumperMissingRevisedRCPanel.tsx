import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, CheckCircle2, FileText, CheckCheck } from "lucide-react";
import { useLumperMissingRevisedRC } from "@/hooks/useLumperMissingRevisedRC";
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


export function LumperMissingRevisedRCPanel() {
  const { toast } = useToast();
  const { hasRole } = useAuthContext();
  const canBypass = hasRole("admin") || hasRole("manager") || hasRole("accounting");
  const { 
    lumperRequests, 
    isLoading, 
    uploadRevisedRC, 
    isUploading,
    bypassRevisedRC,
    isBypassing,
  } = useLumperMissingRevisedRC();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [bypassingId, setBypassingId] = useState<string | null>(null);

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

  const handleBypass = async (orderId: string) => {
    setBypassingId(orderId);
    try {
      await bypassRevisedRC({ orderId });
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
                  <div className="flex items-center justify-center gap-2">
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
                    {canBypass && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isBypassing && bypassingId === order.id}
                            title="Mark as uploaded"
                          >
                            {isBypassing && bypassingId === order.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCheck className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Mark as uploaded?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will hide the row without an actual file. Continue?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleBypass(order.id)}>
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
