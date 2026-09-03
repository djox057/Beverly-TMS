import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Eye, Loader2, FolderPlus, ArrowLeft, Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  TRAILER_DOCUMENT_PICKER,
  detectTrailerFileKeywords,
  getTrailerDocumentTypeById,
} from "@/lib/trailerDocumentKeywords";
import { searchTrailerFiles } from "@/lib/trailerFileSearch";

interface TrailerFile {
  id: string;
  trailer_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  created_at: string;
  folder: string | null;
  keywords: string[] | null;
}

interface TrailerFileFolder {
  id: string;
  name: string;
}

interface TrailerFilesManagerProps {
  trailerId: string;
  trailerNumber?: string;
}

export const TrailerFilesManager = ({ trailerId, trailerNumber }: TrailerFilesManagerProps) => {
  const [files, setFiles] = useState<TrailerFile[]>([]);
  const [folders, setFolders] = useState<TrailerFileFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [openDocTypeId, setOpenDocTypeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
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

  useEffect(() => {
    setSelectedIds([]);
  }, [currentFolder, searchQuery]);

  const loadTrailerFiles = async () => {
    try {
      setIsLoading(true);
      const [filesRes, foldersRes] = await Promise.all([
        supabase
          .from('trailer_files')
          .select('*')
          .eq('trailer_id', trailerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('trailer_file_folders')
          .select('id, name')
          .eq('trailer_id', trailerId)
          .order('name', { ascending: true }),
      ]);

      if (filesRes.error) throw filesRes.error;
      if (foldersRes.error) throw foldersRes.error;
      setFiles((filesRes.data || []) as TrailerFile[]);
      setFolders(foldersRes.data || []);
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

  const searchHits = useMemo(
    () => (searchQuery.trim() ? searchTrailerFiles(files, searchQuery) : []),
    [files, searchQuery]
  );

  const isSearching = searchQuery.trim().length > 0;

  const visibleFiles = useMemo(
    () =>
      isSearching
        ? searchHits.map((h) => h.file)
        : files.filter((f) => (f.folder || null) === currentFolder),
    [files, currentFolder, isSearching, searchHits]
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
        .from('trailer_file_folders')
        .insert({ trailer_id: trailerId, name, created_by: profile?.email || null });

      if (error) throw error;

      setNewFolderName("");
      toast({ title: "Folder created", description: name });
      loadTrailerFiles();
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

  const handleDeleteFolder = async (folder: TrailerFileFolder) => {
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
      const { error } = await supabase.from('trailer_file_folders').delete().eq('id', folder.id);
      if (error) throw error;
      if (currentFolder === folder.name) setCurrentFolder(null);
      loadTrailerFiles();
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
            folder: currentFolder,
            keywords: detectTrailerFileKeywords(file.name),
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

  const deleteFiles = async (targets: TrailerFile[]) => {
    const paths = targets.map((f) => f.file_path);
    const ids = targets.map((f) => f.id);

    const { error: storageError } = await supabase.storage
      .from('trailer-files')
      .remove(paths);

    if (storageError) throw storageError;

    const { error: dbError } = await supabase
      .from('trailer_files')
      .delete()
      .in('id', ids);

    if (dbError) throw dbError;
  };

  const handleDeleteFile = async (file: TrailerFile) => {
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

  const handleDeleteSelected = async () => {
    const targets = visibleFiles.filter((f) => selectedIds.includes(f.id));
    if (targets.length === 0) return;
    if (!confirm(`Delete ${targets.length} selected file(s)?`)) return;

    setIsDeleting(true);
    try {
      await deleteFiles(targets);
      toast({ title: "Success", description: `${targets.length} file(s) deleted` });
      setSelectedIds([]);
      loadTrailerFiles();
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
        .from('trailer_files')
        .update({ folder: targetFolder })
        .in('id', selectedIds);
      if (error) throw error;
      toast({
        title: "Moved",
        description: `${selectedIds.length} file(s) moved to ${targetFolder || 'All files'}`,
      });
      setSelectedIds([]);
      loadTrailerFiles();
    } catch (error) {
      console.error('Error moving files:', error);
      toast({ title: "Error", description: "Failed to move files", variant: "destructive" });
    }
  };

  const handleSetDocumentType = async (file: TrailerFile, docId: string) => {
    const doc = getTrailerDocumentTypeById(docId);
    const keywords = doc ? [doc.id, ...doc.keywords] : [];
    try {
      const { error } = await supabase
        .from('trailer_files')
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
    () => TRAILER_DOCUMENT_PICKER.filter((doc) => !presentDocIds.has(doc.id)),
    [presentDocIds]
  );
  const presentRequiredCount = TRAILER_DOCUMENT_PICKER.length - missingDocs.length;

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
        <CardTitle>Trailer Files {trailerNumber && `- ${trailerNumber}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search files by meaning — e.g. "cab card", "annual inspection"'
              className="pl-9 pr-9"
            />
            {isSearching && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {isSearching && (
            <p className="text-xs text-muted-foreground">
              {visibleFiles.length} match{visibleFiles.length === 1 ? '' : 'es'} across all folders
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label className="mb-0">Required Documents</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant={missingDocs.length === 0 ? "default" : "outline"} className="h-7 px-2 text-xs">
                {presentRequiredCount}/{TRAILER_DOCUMENT_PICKER.length}
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
          <Label htmlFor="trailer-file-input">
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label className="flex items-center gap-2">
              {currentFolder && !isSearching && (
                <Button size="sm" variant="ghost" className="px-1" onClick={() => setCurrentFolder(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {isSearching
                ? `Search results (${visibleFiles.length})`
                : currentFolder
                  ? `Files in "${currentFolder}"`
                  : 'Uploaded Files'}
            </Label>
            {visibleFiles.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id="trailer-files-select-all"
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedIds(checked ? visibleFiles.map((f) => f.id) : [])
                    }
                  />
                  <label htmlFor="trailer-files-select-all" className="cursor-pointer">
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
              {isSearching ? 'No files match your search' : 'No files uploaded yet'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleFiles.map((file) => {
                const currentDocId = (file.keywords || []).find((k) => getTrailerDocumentTypeById(k)) || "";
                const currentDoc = currentDocId ? getTrailerDocumentTypeById(currentDocId) : null;
                return (
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
                      <Popover
                        open={openDocTypeId === file.id}
                        onOpenChange={(open) => setOpenDocTypeId(open ? file.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            size="sm"
                            aria-expanded={openDocTypeId === file.id}
                            className="w-[200px] justify-between text-xs"
                          >
                            {currentDoc?.label || "No document type"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-0">
                          <Command>
                            <CommandInput placeholder="Search document type..." />
                            <CommandList>
                              <CommandEmpty>No type found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    handleSetDocumentType(file, "");
                                    setOpenDocTypeId(null);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", !currentDocId ? "opacity-100" : "opacity-0")} />
                                  No document type
                                </CommandItem>
                                {TRAILER_DOCUMENT_PICKER.map((doc) => (
                                  <CommandItem
                                    key={doc.id}
                                    onSelect={() => {
                                      handleSetDocumentType(file, doc.id);
                                      setOpenDocTypeId(null);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", currentDocId === doc.id ? "opacity-100" : "opacity-0")} />
                                    {doc.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
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
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
