import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Eye, Loader2, Folder, FolderPlus, FolderOpen, ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DRIVER_DOCUMENT_PICKER,
  detectDriverFileKeywords,
  getDocumentTypeById,
} from "@/lib/driverDocumentKeywords";



interface DriverFile {
  id: string;
  driver_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  created_at: string;
  folder: string | null;
  keywords: string[] | null;
}

interface DriverFileFolder {
  id: string;
  name: string;
}

interface DriverFilesManagerProps {
  driverId: string;
  driverName?: string;
}

export const DriverFilesManager = ({ driverId, driverName }: DriverFilesManagerProps) => {
  const [files, setFiles] = useState<DriverFile[]>([]);
  const [folders, setFolders] = useState<DriverFileFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuthContext();

  useEffect(() => {
    if (driverId) {
      loadDriverFiles();
    }
  }, [driverId]);

  useEffect(() => {
    setSelectedIds([]);
  }, [currentFolder]);

  const loadDriverFiles = async () => {
    try {
      setIsLoading(true);
      const [filesRes, foldersRes] = await Promise.all([
        supabase
          .from('driver_files')
          .select('*')
          .eq('driver_id', driverId)
          .order('created_at', { ascending: false }),
        supabase
          .from('driver_file_folders')
          .select('id, name')
          .eq('driver_id', driverId)
          .order('name', { ascending: true }),
      ]);

      if (filesRes.error) throw filesRes.error;
      if (foldersRes.error) throw foldersRes.error;
      setFiles((filesRes.data || []) as DriverFile[]);
      setFolders(foldersRes.data || []);
    } catch (error) {
      console.error('Error loading driver files:', error);
      toast({
        title: "Error",
        description: "Failed to load driver files",
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
        .from('driver_file_folders')
        .insert({ driver_id: driverId, name, created_by: profile?.email || null });

      if (error) throw error;

      setNewFolderName("");
      toast({ title: "Folder created", description: name });
      loadDriverFiles();
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

  const handleDeleteFolder = async (folder: DriverFileFolder) => {
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
      const { error } = await supabase.from('driver_file_folders').delete().eq('id', folder.id);
      if (error) throw error;
      if (currentFolder === folder.name) setCurrentFolder(null);
      loadDriverFiles();
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
        const fileName = `${driverId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('driver-files')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from('driver_files')
          .insert({
            driver_id: driverId,
            file_name: file.name,
            file_path: fileName,
            file_size: file.size,
            content_type: file.type,
            uploaded_by: profile?.email || 'unknown',
            folder: currentFolder,
            keywords: detectDriverFileKeywords(file.name),
          });

        if (dbError) throw dbError;
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Success",
        description: "Files uploaded successfully",
      });

      setSelectedFiles(null);
      const fileInput = document.getElementById('driver-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      loadDriverFiles();
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

  const handleViewFile = async (file: DriverFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('driver-files')
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

  const deleteFiles = async (targets: DriverFile[]) => {
    const paths = targets.map((f) => f.file_path);
    const ids = targets.map((f) => f.id);

    const { error: storageError } = await supabase.storage
      .from('driver-files')
      .remove(paths);

    if (storageError) throw storageError;

    const { error: dbError } = await supabase
      .from('driver_files')
      .delete()
      .in('id', ids);

    if (dbError) throw dbError;
  };

  const handleDeleteFile = async (file: DriverFile) => {
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
      loadDriverFiles();
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
      loadDriverFiles();
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
        .from('driver_files')
        .update({ folder: targetFolder })
        .in('id', selectedIds);
      if (error) throw error;
      toast({
        title: "Moved",
        description: `${selectedIds.length} file(s) moved to ${targetFolder || 'All files'}`,
      });
      setSelectedIds([]);
      loadDriverFiles();
    } catch (error) {
      console.error('Error moving files:', error);
      toast({ title: "Error", description: "Failed to move files", variant: "destructive" });
    }
  };

  const handleSetDocumentType = async (file: DriverFile, docId: string) => {
    const doc = getDocumentTypeById(docId);
    const keywords = doc ? [doc.id, ...doc.keywords] : [];
    try {
      const { error } = await supabase
        .from('driver_files')
        .update({ keywords })
        .eq('id', file.id);
      if (error) throw error;
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, keywords } : f)));
      toast({ title: "Keywords updated", description: doc ? doc.label : "Cleared" });
    } catch (error) {
      console.error('Error updating keywords:', error);
      toast({ title: "Error", description: "Failed to update keywords", variant: "destructive" });
    }
  };

  const presentDocIds = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => (f.keywords || []).forEach((k) => set.add(k)));
    return set;
  }, [files]);

  const missingDocs = useMemo(
    () => DRIVER_DOCUMENT_PICKER.filter((doc) => !presentDocIds.has(doc.id)),
    [presentDocIds]
  );
  const presentRequiredCount = DRIVER_DOCUMENT_PICKER.length - missingDocs.length;


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
        <CardTitle>Driver Files {driverName && `- ${driverName}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="mb-0">Required Documents</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant={missingDocs.length === 0 ? "default" : "outline"} className="h-7 px-2 text-xs">
                {presentRequiredCount}/{DRIVER_DOCUMENT_PICKER.length}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3">
              {missingDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">All required documents are present.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Missing ({missingDocs.length})</p>
                  <ul className="space-y-1 max-h-64 overflow-auto">
                    {missingDocs.map((doc) => (
                      <li key={doc.id} className="text-sm text-muted-foreground">• {doc.label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Folders</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={currentFolder ?? "__all__"}
              onValueChange={(v) => setCurrentFolder(v === "__all__" ? null : v)}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">
                  All files ({files.filter((f) => !f.folder).length})
                </SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.name}>
                    {folder.name} ({folderCounts[folder.name] || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => setFolderDialogOpen(true)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Create folder
            </Button>

            {currentFolder && (
              <Button
                variant="outline"
                size="icon"
                title="Delete folder"
                onClick={() => {
                  const folder = folders.find((f) => f.name === currentFolder);
                  if (folder) handleDeleteFolder(folder);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateFolder().then(() => setFolderDialogOpen(false));
                }
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={isCreatingFolder || !newFolderName.trim()}
                onClick={() => handleCreateFolder().then(() => setFolderDialogOpen(false))}
              >
                {isCreatingFolder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <div className="space-y-2">
          <Label htmlFor="driver-file-input">
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
                  id="driver-file-input"
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
                    id="driver-files-select-all"
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedIds(checked ? visibleFiles.map((f) => f.id) : [])
                    }
                  />
                  <label htmlFor="driver-files-select-all" className="cursor-pointer">
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
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {(file.keywords || []).length > 0 ? (
                          (file.keywords || []).slice(1).map((k) => (
                            <Badge key={k} variant="secondary" className="text-[10px] font-normal">
                              {k}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[10px] text-muted-foreground">No keywords</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs max-w-[180px]"
                      value={
                        (file.keywords || []).find((k) => !!getDocumentTypeById(k)) || ''
                      }
                      onChange={(e) => handleSetDocumentType(file, e.target.value)}
                      title="Document type / keywords"
                    >
                      <option value="">No document type</option>
                      {DRIVER_DOCUMENT_PICKER.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.label}
                        </option>
                      ))}
                    </select>
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
