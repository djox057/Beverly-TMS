import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadOrderFilePreserveName } from "@/utils/orderFilesUpload";
import { useToast } from "@/hooks/use-toast";

export interface ScaleTicketValues {
  steerAxle: number | null;
  driveAxle: number | null;
  trailerAxle: number | null;
  gross: number | null;
}

interface ScaleTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  defaultValues?: Partial<ScaleTicketValues>;
  onUploaded?: (
    files: { file_name: string; file_path: string; file_category: string }[],
    values: ScaleTicketValues,
  ) => void;
}

export const ScaleTicketDialog = ({
  open,
  onOpenChange,
  orderId,
  defaultValues,
  onUploaded,
}: ScaleTicketDialogProps) => {
  const { toast } = useToast();
  const [steer, setSteer] = useState("");
  const [drive, setDrive] = useState("");
  const [trailer, setTrailer] = useState("");
  const [gross, setGross] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSteer(defaultValues?.steerAxle != null ? String(defaultValues.steerAxle) : "");
      setDrive(defaultValues?.driveAxle != null ? String(defaultValues.driveAxle) : "");
      setTrailer(defaultValues?.trailerAxle != null ? String(defaultValues.trailerAxle) : "");
      setGross(defaultValues?.gross != null ? String(defaultValues.gross) : "");
      setFiles([]);
    }
  }, [open, defaultValues?.steerAxle, defaultValues?.driveAxle, defaultValues?.trailerAxle, defaultValues?.gross]);

  const parseNum = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  };

  const handleSubmit = async () => {
    if (!orderId) return;
    const values: ScaleTicketValues = {
      steerAxle: parseNum(steer),
      driveAxle: parseNum(drive),
      trailerAxle: parseNum(trailer),
      gross: parseNum(gross),
    };

    if (
      values.steerAxle == null ||
      values.driveAxle == null ||
      values.trailerAxle == null ||
      values.gross == null
    ) {
      toast({
        title: "Missing weights",
        description: "Enter steer, drive, trailer, and gross weights.",
        variant: "destructive",
      });
      return;
    }

    if (!files.length) {
      toast({
        title: "Missing scale ticket",
        description: "Select at least one scale ticket file to upload.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user?.id || "")
        .single();

      const uploadedFiles: { file_name: string; file_path: string; file_category: string }[] = [];
      for (const file of files) {
        const filePath = await uploadOrderFilePreserveName({
          orderId,
          folder: "ADDITIONAL",
          file,
        });
        const { error: fileError } = await supabase.from("order_files").insert({
          order_id: orderId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          content_type: file.type,
          file_category: "ADDITIONAL",
          uploaded_by: profile?.full_name || profile?.email || "Unknown User",
        });
        if (fileError) throw fileError;
        uploadedFiles.push({ file_name: file.name, file_path: filePath, file_category: "ADDITIONAL" });
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          scale_steer_axle: values.steerAxle,
          scale_drive_axle: values.driveAxle,
          scale_trailer_axle: values.trailerAxle,
          scale_gross: values.gross,
        })
        .eq("id", orderId);
      if (updateError) throw updateError;

      toast({ title: "Scale ticket saved", description: "Weights and file saved successfully." });
      onUploaded?.(uploadedFiles, values);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Scale ticket upload failed:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to save scale ticket",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Scale Ticket</DialogTitle>
          <DialogDescription>
            Enter axle weights and attach the scale ticket file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="steer">Steer axle (lbs)</Label>
              <Input
                id="steer"
                type="number"
                inputMode="decimal"
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="drive">Drive axle (lbs)</Label>
              <Input
                id="drive"
                type="number"
                inputMode="decimal"
                value={drive}
                onChange={(e) => setDrive(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trailer">Trailer axle (lbs)</Label>
              <Input
                id="trailer"
                type="number"
                inputMode="decimal"
                value={trailer}
                onChange={(e) => setTrailer(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gross">Gross (lbs)</Label>
              <Input
                id="gross"
                type="number"
                inputMode="decimal"
                value={gross}
                onChange={(e) => setGross(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Scale ticket file</Label>
            <div
              className="border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
              <div className="mt-2 text-sm text-muted-foreground">
                {files.length
                  ? files.map((f) => f.name).join(", ")
                  : "Click to select scale ticket file(s)"}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setFiles(Array.from(e.target.files));
                }}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save Scale Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};