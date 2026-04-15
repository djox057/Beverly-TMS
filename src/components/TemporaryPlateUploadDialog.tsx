import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";

interface TemporaryPlateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckId: string;
  truckNumber: string;
  temporaryPlateId: string;
}

export function TemporaryPlateUploadDialog({
  open,
  onOpenChange,
  truckId,
  truckNumber,
  temporaryPlateId,
}: TemporaryPlateUploadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  React.useEffect(() => {
    if (open && temporaryPlateId) {
      setLoadingExisting(true);
      supabase.storage
        .from("temporary-plate-files")
        .list(temporaryPlateId)
        .then(({ data }) => {
          setExistingFiles((data || []).map((f) => f.name));
          setLoadingExisting(false);
        });
    } else {
      setExistingFiles([]);
      setFiles([]);
    }
  }, [open, temporaryPlateId]);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `${temporaryPlateId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage
          .from("temporary-plate-files")
          .upload(path, file);
        if (error) throw error;
      }
      toast({ title: "Photos uploaded successfully" });
      setFiles([]);
      queryClient.invalidateQueries({ queryKey: ["temporary-plates-files"] });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Temporary Plate - Truck #{truckNumber}</DialogTitle>
        </DialogHeader>

        {loadingExisting ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {existingFiles.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium mb-1">Existing photos: {existingFiles.length}</p>
                <div className="flex flex-wrap gap-2">
                  {existingFiles.map((name) => (
                    <div key={name} className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                      <ImageIcon className="h-3 w-3" />
                      <span className="truncate max-w-[120px]">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setFiles(Array.from(e.target.files));
                }}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Select Photos
              </Button>

              {files.length > 0 && (
                <div className="space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-muted px-2 py-1 rounded">
                      <span className="truncate max-w-[200px]">{f.name}</span>
                      <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                className="w-full"
                disabled={files.length === 0 || uploading}
                onClick={handleUpload}
              >
                {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Upload {files.length > 0 ? `(${files.length})` : ""}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
