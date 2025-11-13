import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Trash2, Loader2 } from "lucide-react";

interface PendingFile {
  file: File;
  id: string;
}

interface DriverFilesManagerPendingProps {
  pendingFiles: PendingFile[];
  onFilesChange: (files: PendingFile[]) => void;
  isUploading?: boolean;
}

export const DriverFilesManagerPending = ({ 
  pendingFiles, 
  onFilesChange,
  isUploading = false 
}: DriverFilesManagerPendingProps) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newPendingFiles: PendingFile[] = Array.from(files).map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`
    }));

    onFilesChange([...pendingFiles, ...newPendingFiles]);
  };

  const handleRemoveFile = (fileId: string) => {
    onFilesChange(pendingFiles.filter(f => f.id !== fileId));
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Driver Files (Pending Upload)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50'
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-2">
            Drag and drop files here, or click to select
          </p>
          <Label htmlFor="pending-file-input" className="cursor-pointer">
            <Button type="button" variant="outline" size="sm" asChild>
              <span>Select Files</span>
            </Button>
          </Label>
          <Input
            id="pending-file-input"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={isUploading}
          />
        </div>

        {pendingFiles.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Files Ready to Upload ({pendingFiles.length})
            </Label>
            <div className="space-y-2">
              {pendingFiles.map((pendingFile) => (
                <div
                  key={pendingFile.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {pendingFile.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(pendingFile.file.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFile(pendingFile.id)}
                    disabled={isUploading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {isUploading && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading files...</span>
              </div>
            )}
          </div>
        )}

        {pendingFiles.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No files selected. Files will be uploaded after the driver is created.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
