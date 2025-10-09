import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Eye, Loader2 } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";

interface TrailerFile {
  id: string;
  trailer_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  created_at: string;
}

interface TrailerFilesManagerProps {
  trailerId: string;
  trailerNumber?: string;
}

export const TrailerFilesManager = ({ trailerId, trailerNumber }: TrailerFilesManagerProps) => {
  const [files, setFiles] = useState<TrailerFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuthContext();

  useEffect(() => {
    if (trailerId) {
      loadTrailerFiles();
    }
  }, [trailerId]);

  const loadTrailerFiles = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('trailer_files')
        .select('*')
        .eq('trailer_id', trailerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error('Error loading trailer files:', error);
      toast({
        title: "Error",
        description: "Failed to load trailer files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select files to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const uploadPromises = Array.from(selectedFiles).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${trailerId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('trailer-files')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from('trailer_files')
          .insert({
            trailer_id: trailerId,
            file_name: file.name,
            file_path: fileName,
            file_size: file.size,
            content_type: file.type,
            uploaded_by: profile?.email || 'unknown',
          });

        if (dbError) throw dbError;
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Success",
        description: "Files uploaded successfully",
      });

      setSelectedFiles(null);
      const fileInput = document.getElementById('trailer-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      loadTrailerFiles();
    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: "Error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewFile = async (file: TrailerFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('trailer-files')
        .createSignedUrl(file.file_path, 3600); // 1 hour expiry

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('No signed URL generated');

      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error viewing file:', error);
      toast({
        title: "Error",
        description: "Failed to view file",
        variant: "destructive",
      });
    }
  };

  const handleDeleteFile = async (file: TrailerFile) => {
    if (!confirm(`Are you sure you want to delete ${file.file_name}?`)) {
      return;
    }

    try {
      const { error: storageError } = await supabase.storage
        .from('trailer-files')
        .remove([file.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('trailer_files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "File deleted successfully",
      });

      loadTrailerFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: "Error",
        description: "Failed to delete file",
        variant: "destructive",
      });
    }
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

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      setSelectedFiles(droppedFiles);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trailer Files {trailerNumber && `- ${trailerNumber}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="trailer-file-input">Upload Files</Label>
          <div
            className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
              isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-4">
              <Upload className={`h-8 w-8 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {isDragOver ? 'Drop files here' : 'Drag and drop files here'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">or</p>
              </div>
              <div className="flex gap-2 w-full">
                <Input
                  id="trailer-file-input"
                  type="file"
                  multiple
                  onChange={(e) => setSelectedFiles(e.target.files)}
                  className="flex-1"
                />
                <Button 
                  onClick={handleFileUpload} 
                  disabled={isUploading || !selectedFiles}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
              {selectedFiles && selectedFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Uploaded Files</Label>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              No files uploaded yet
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div 
                  key={file.id} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{file.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.file_size / 1024).toFixed(2)} KB • {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewFile(file)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteFile(file)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};