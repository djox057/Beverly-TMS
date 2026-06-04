import { useState, useEffect, useRef, useMemo } from "react";
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
import { Upload, AlertTriangle } from "lucide-react";
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
  const [isDragging, setIsDragging] = useState(false);
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

  const previews = useMemo(() => {
    if (!open || files.length === 0) return [];
    return files.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
  }, [open, files]);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const LEGAL_LIMITS = {
    steer: 12000,
    drive: 34000,
    trailer: 34000,
    gross: 80000,
  };

  const checkOver = (s: string, limit: number) => {
    const n = parseFloat(s);
    return !isNaN(n) && n > limit;
  };

  const overSteer = checkOver(steer, LEGAL_LIMITS.steer);
  const overDrive = checkOver(drive, LEGAL_LIMITS.drive);
  const overTrailer = checkOver(trailer, LEGAL_LIMITS.trailer);
  const overGross = checkOver(gross, LEGAL_LIMITS.gross);
  const anyOver = overSteer || overDrive || overTrailer || overGross;

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
      <DialogContent className="max-w-lg h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Upload Scale Ticket</DialogTitle>
          <DialogDescription>
            Enter axle weights and attach the scale ticket file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="steer">Steer axle (lbs) <span className="text-muted-foreground text-xs">≤ 12,000</span></Label>
              <Input
                id="steer"
                type="number"
                inputMode="decimal"
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                placeholder="0"
                className={overSteer ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {overSteer && (
                <p className="text-xs text-destructive">Above legal limit (12,000 lb)</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="drive">Drive axle (lbs) <span className="text-muted-foreground text-xs">≤ 34,000</span></Label>
              <Input
                id="drive"
                type="number"
                inputMode="decimal"
                value={drive}
                onChange={(e) => setDrive(e.target.value)}
                placeholder="0"
                className={overDrive ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {overDrive && (
                <p className="text-xs text-destructive">Above legal limit (34,000 lb)</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="trailer">Trailer axle (lbs) <span className="text-muted-foreground text-xs">≤ 34,000</span></Label>
              <Input
                id="trailer"
                type="number"
                inputMode="decimal"
                value={trailer}
                onChange={(e) => setTrailer(e.target.value)}
                placeholder="0"
                className={overTrailer ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {overTrailer && (
                <p className="text-xs text-destructive">Above legal limit (34,000 lb)</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="gross">Gross (lbs) <span className="text-muted-foreground text-xs">≤ 80,000</span></Label>
              <Input
                id="gross"
                type="number"
                inputMode="decimal"
                value={gross}
                onChange={(e) => setGross(e.target.value)}
                placeholder="0"
                className={overGross ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {overGross && (
                <p className="text-xs text-destructive">Above legal limit (80,000 lb)</p>
              )}
            </div>
          </div>

          {anyOver && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>One or more weights exceed federal legal limits (Steer 12,000 / Drive 34,000 / Trailer 34,000 / Gross 80,000 lb).</span>
            </div>
          )}

          <div className="space-y-1">
            <Label>Scale ticket file</Label>
            <div
              className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) {
                  setFiles(Array.from(e.dataTransfer.files));
                }
              }}
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
              <div className="mt-2 text-sm text-muted-foreground">
                {files.length
                  ? files.map((f) => f.name).join(", ")
                  : "Click to select or drag & drop scale ticket file(s)"}
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

          {previews.length > 0 && (
            <div className="space-y-2 flex-1 min-h-0 overflow-auto rounded-md border p-2 bg-muted/30">
              <div className="text-xs font-medium text-muted-foreground">
                Preview ({previews.length})
              </div>
              {previews.map(({ file, url }, i) => {
                const isImage = file.type.startsWith("image/");
                const isPdf =
                  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                return (
                  <div key={i} className="space-y-1 h-full flex flex-col min-h-0">
                    <div className="text-xs text-muted-foreground truncate">{file.name}</div>
                    {isImage ? (
                      <img
                        src={url}
                        alt={file.name}
                        className="flex-1 min-h-0 w-auto max-w-full mx-auto rounded border bg-background object-contain"
                      />
                    ) : isPdf ? (
                      <iframe
                        src={url}
                        title={file.name}
                        className="w-full flex-1 min-h-0 rounded border bg-background"
                      />
                    ) : (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline"
                      >
                        Open file
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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