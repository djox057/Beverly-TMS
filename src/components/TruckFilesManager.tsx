import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Eye, Loader2, Folder, FolderPlus, FolderOpen, ArrowLeft } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";

interface TruckFile {
  id: string;
  truck_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  created_at: string;
  folder: string | null;
}

interface TruckFileFolder {
  id: string;
  name: string;
}

interface TruckFilesManagerProps {
  truckId: string;
  truckNumber?: string;
}

export const TruckFilesManager = ({ truckId, truckNumber }: TruckFilesManagerProps) => {
  const [files, setFiles] = useState<TruckFile[]>([]);
  const [folders, setFolders] = useState<TruckFileFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuthContext();

  useEffect(() => {
    if (truckId) {
      loadTruckFiles();
    }
  }, [truckId]);

  useEffect(() => {
    setSelectedIds([]);
  }, [currentFolder]);

  const loadTruckFiles = async () => {
    try {
      setIsLoading(true);
      const [filesRes, foldersRes] = await Promise.all([
        supabase
          .from('truck_files')
          .select('*')
          .eq('truck_id', truckId)
          .order('created_at', { ascending: false }),
        supabase
          .from('truck_file_folders')
          .select('id, name')
          .eq('truck_id', truckId)
          .order('name', { ascending: true }),
      ]);

      if (filesRes.error) throw filesRes.error;
      if (foldersRes.error) throw foldersRes.error;
      setFiles((filesRes.data || []) as TruckFile[]);
      setFolders(foldersRes.data || []);
    } catch (error) {
      console.error('Error loading truck files:', error);
      toast({
        title: "Error",
        description: "Failed to load truck files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const visibleFiles = useMemo(
    () => files.filter((f) => (f.folder || null) === currentFolder),
    [files, currentFolder]
  );

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    files.forEach((f) => {
      if (f.folder) counts[f.folder] = (counts[f.folder] || 0) + 1;
    });
    return counts;
  }, [files]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    setIsCreatingFolder(true);
    try {
      const { error } = await supabase
        .from('truck_file_folders')
        .insert({ truck_id: truckId, name, created_by: profile?.email || null });

      if (error) throw error;

      setNewFolderName("");
      toast({ title: "Folder created", description: name });
      loadTruckFiles();
    } catch (error: any) {
      console.error('Error creating folder:', error);
      toast({
        title: "Error",
        description: error?.code === '23505' ? "A folder with that name already exists" : "Failed to create folder",
        variant: "destructive",
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder: TruckFileFolder) => {
    const count = folderCounts[folder.name] || 0;
    if (count > 0) {
      toast({
        title: "Folder not empty",
        description: `Delete or move the ${count} file(s) inside first`,
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`Delete folder "${folder.name}"?`)) return;

    try {
      const { error } = await supabase.from('truck_file_folders').delete().eq('id', folder.id);
      if (error) throw error;
      if (currentFolder === folder.name) setCurrentFolder(null);
      loadTruckFiles();
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast({ title: "Error", description: "Failed to delete folder", variant: "destructive" });
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
        const fileName = `${truckId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('truck-files')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from('truck_files')
          .insert({
            truck_id: truckId,
            file_name: file.name,
            file_path: fileName,
            file_size: file.size,
            content_type: file.type,
            uploaded_by: profile?.email || 'unknown',
            folder: currentFolder,
          });

        if (dbError) throw dbError;
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Success",
        description: "Files uploaded successfully",
      });

      setSelectedFiles(null);
      const fileInput = document.getElementById('truck-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      loadTruckFiles();
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

  const handleViewFile = async (file: TruckFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('truck-files')
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

  const deleteFiles = async (targets: TruckFile[]) => {
    const paths = targets.map((f) => f.file_path);
    const ids = targets.map((f) => f.id);

    const { error: storageError } = await supabase.storage
      .from('truck-files')
      .remove(paths);

    if (storageError) throw storageError;

    const { error: dbError } = await supabase
      .from('truck_files')
      .delete()
      .in('id', ids);

    if (dbError) throw dbError;
  };

  const handleDeleteFile = async (file: TruckFile) => {
    if (!confirm(`Are you sure you want to delete ${file.file_name}?`)) {
      return;
    }

    try {
      await deleteFiles([file]);

      toast({
        title: "Success",
        description: "File deleted successfully",
      });

      setSelectedIds((prev) => prev.filter((id) => id !== file.id));
      loadTruckFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: "Error",
        description: "Failed to delete file",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSelected = async () => {
    const targets = visibleFiles.filter((f) => selectedIds.includes(f.id));
    if (targets.length === 0) return;
    if (!confirm(`Delete ${targets.length} selected file(s)?`)) return;

    setIsDeleting(true);
    try {
      await deleteFiles(targets);
      toast({ title: "Success", description: `${targets.length} file(s) deleted` });
      setSelectedIds([]);
      loadTruckFiles();
    } catch (error) {
      console.error('Error deleting files:', error);
      toast({ title: "Error", description: "Failed to delete selected files", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveSelected = async (targetFolder: string | null) => {
    if (selectedIds.length === 0) return;
    try {
      const { error } = await supabase
        .from('truck_files')
        .update({ folder: targetFolder })
        .in('id', selectedIds);
      if (error) throw error;
      toast({
        title: "Moved",
        description: `${selectedIds.length} file(s) moved to ${targetFolder || 'All files'}`,
      });
      setSelectedIds([]);
      loadTruckFiles();
    } catch (error) {
      console.error('Error moving files:', error);
      toast({ title: "Error", description: "Failed to move files", variant: "destructive" });
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const allSelected = visibleFiles.length > 0 && selectedIds.length === visibleFiles.length;

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
        <CardTitle>Truck Files {truckNumber && `- ${truckNumber}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Folders</Label>
          <div className="flex gap-2">
            <Input
              placeholder="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateFolder();
                }
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleCreateFolder}
              disabled={isCreatingFolder || !newFolderName.trim()}
            >
              {isCreatingFolder ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderPlus className="mr-2 h-4 w-4" />
              )}
              Create folder
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={currentFolder === null ? "default" : "outline"}
              onClick={() => setCurrentFolder(null)}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              All files ({files.filter((f) => !f.folder).length})
            </Button>
            {folders.map((folder) => (
              <div key={folder.id} className="flex items-center">
                <Button
                  size="sm"
                  variant={currentFolder === folder.name ? "default" : "outline"}
                  onClick={() => setCurrentFolder(folder.name)}
                  className="rounded-r-none"
                >
                  <Folder className="mr-2 h-4 w-4" />
                  {folder.name} ({folderCounts[folder.name] || 0})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-l-none border-l-0 px-2"
                  onClick={() => handleDeleteFolder(folder)}
                  title="Delete folder"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="truck-file-input">
            Upload Files {currentFolder ? `into "${currentFolder}"` : ''}
          </Label>
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
                  id="truck-file-input"
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label className="flex items-center gap-2">
              {currentFolder && (
                <Button size="sm" variant="ghost" className="px-1" onClick={() => setCurrentFolder(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {currentFolder ? `Files in "${currentFolder}"` : 'Uploaded Files'}
            </Label>
            {visibleFiles.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id="truck-files-select-all"
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedIds(checked ? visibleFiles.map((f) => f.id) : [])
                    }
                  />
                  <label htmlFor="truck-files-select-all" className="cursor-pointer">
                    Select all
                  </label>
                </div>
                {selectedIds.length > 0 && (
                  <>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        handleMoveSelected(e.target.value === '__root__' ? null : e.target.value);
                      }}
                    >
                      <option value="">Move to…</option>
                      {currentFolder !== null && <option value="__root__">All files (no folder)</option>}
                      {folders
                        .filter((f) => f.name !== currentFolder)
                        .map((f) => (
                          <option key={f.id} value={f.name}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleDeleteSelected}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete selected ({selectedIds.length})
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : visibleFiles.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              No files uploaded yet
            </div>
          ) : (
            <div className="space-y-2">
              {visibleFiles.map((file) => (
                <div 
                  key={file.id} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.includes(file.id)}
                      onCheckedChange={(checked) => toggleSelected(file.id, checked === true)}
                    />
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
