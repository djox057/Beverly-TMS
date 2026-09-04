import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Eye, Loader2, Folder, FolderPlus, FolderOpen, ArrowLeft, Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DRIVER_DOCUMENT_PICKER,
  detectDriverDocumentType,
  getDocumentTypeById,
} from "@/lib/driverDocumentKeywords";
import { searchDriverFiles } from "@/lib/driverFileSearch";

interface PendingUpload {
  id: string;
  file: File;
  /** null = "Other" (no required document type) */
  docId: string | null;
  autoDetected: boolean;
  analyzing?: boolean;
  aiDetected?: boolean;
}

export interface DriverCdlSuggestion {
  cdl_number?: string;
  cdl_expiration_date?: string;
  home_address?: string;
  home_city?: string;
  home_state?: string;
}





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
  /** When provided, CDL values read from an uploaded CDL can be pushed into the driver form. */
  onApplyDriverFields?: (fields: DriverCdlSuggestion) => void;
}

export const DriverFilesManager = ({ driverId, driverName, onApplyDriverFields }: DriverFilesManagerProps) => {
  const [files, setFiles] = useState<DriverFile[]>([]);
  const [folders, setFolders] = useState<DriverFileFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openDocTypeId, setOpenDocTypeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");


  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [openPendingDocId, setOpenPendingDocId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [cdlSuggestion, setCdlSuggestion] = useState<DriverCdlSuggestion | null>(null);
  const { toast } = useToast();
  const { profile } = useAuthContext();


  useEffect(() => {
    if (driverId) {
      loadDriverFiles();
    }
  }, [driverId]);

  useEffect(() => {
    setSelectedIds([]);
  }, [currentFolder, searchQuery]);

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

  const searchHits = useMemo(
    () => (searchQuery.trim() ? searchDriverFiles(files, searchQuery) : []),
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

  const analyzeWithAi = async (pending: PendingUpload) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired");

      const body = new FormData();
      body.append("file", pending.file);
      body.append(
        "types",
        JSON.stringify(DRIVER_DOCUMENT_PICKER.map((d) => ({ id: d.id, label: d.label })))
      );

      const response = await fetch(
        "https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/classify-driver-document",
        { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body }
      );
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "AI read failed");

      const result = json.data || {};
      setPendingUploads((prev) =>
        prev.map((p) =>
          p.id === pending.id
            ? {
                ...p,
                analyzing: false,
                docId: result.docId ?? p.docId,
                aiDetected: !!result.docId,
              }
            : p
        )
      );

      const suggestion: DriverCdlSuggestion = {};
      if (result.cdl_number) suggestion.cdl_number = result.cdl_number;
      if (result.cdl_expiration_date) suggestion.cdl_expiration_date = result.cdl_expiration_date;
      if (result.home_address) suggestion.home_address = result.home_address;
      if (result.home_city) suggestion.home_city = result.home_city;
      if (result.home_state) suggestion.home_state = result.home_state;

      if (Object.keys(suggestion).length > 0 && onApplyDriverFields) {
        setCdlSuggestion((prev) => ({ ...(prev || {}), ...suggestion }));
      }
    } catch (error) {
      console.error("AI document analysis failed:", error);
      setPendingUploads((prev) =>
        prev.map((p) => (p.id === pending.id ? { ...p, analyzing: false } : p))
      );
    }
  };

  const addPendingFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next: PendingUpload[] = Array.from(list).map((file) => {
      const detected = detectDriverDocumentType(file.name);
      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
        file,
        docId: detected?.id ?? null,
        autoDetected: !!detected,
        analyzing: true,
      };
    });
    setPendingUploads((prev) => [...prev, ...next]);
    next.forEach((p) => { void analyzeWithAi(p); });
  };


  const clearPendingInput = () => {
    const fileInput = document.getElementById('driver-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleFileUpload = async () => {
    if (pendingUploads.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select files to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const uploadPromises = pendingUploads.map(async ({ file, docId }) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${driverId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('driver-files')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const doc = docId ? getDocumentTypeById(docId) : null;
        const keywords = doc ? [doc.id, ...doc.keywords] : [];

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
            keywords,
          });

        if (dbError) throw dbError;
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Success",
        description: "Files uploaded successfully",
      });

      setPendingUploads([]);
      clearPendingInput();
      
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
      addPendingFiles(droppedFiles);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Driver Files {driverName && `- ${driverName}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search files by meaning — e.g. "cab card", "physical", "driving record"'
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
                  onChange={(e) => {
                    addPendingFiles(e.target.files);
                    clearPendingInput();
                  }}
                  className="flex-1"
                />
                <Button 
                  onClick={handleFileUpload} 
                  disabled={isUploading || pendingUploads.length === 0}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload{pendingUploads.length > 0 ? ` (${pendingUploads.length})` : ''}
                    </>
                  )}
                </Button>
              </div>

              {pendingUploads.length > 0 && (
                <div className="w-full space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Confirm what each file is before uploading:
                  </p>
                  {pendingUploads.map((pending) => {
                    const doc = pending.docId ? getDocumentTypeById(pending.docId) : null;
                    return (
                      <div
                        key={pending.id}
                        className="flex items-center gap-2 rounded-md border bg-background p-2"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{pending.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {pending.analyzing
                              ? 'Reading document with AI…'
                              : pending.aiDetected
                                ? 'Detected by AI'
                                : pending.autoDetected
                                  ? 'Detected from file name'
                                  : 'Not recognized — pick a type'}

                          </p>
                        </div>
                        <Popover
                          open={openPendingDocId === pending.id}
                          onOpenChange={(o) => setOpenPendingDocId(o ? pending.id : null)}
                          modal={false}
                        >
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 w-[200px] justify-between">
                              <span className="truncate">{doc ? doc.label : 'Other'}</span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-[260px] p-0">
                            <Command>
                              <CommandInput placeholder="Search document type..." />
                              <CommandList>
                                <CommandEmpty>No document type found.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="Other"
                                    onSelect={() => {
                                      setPendingUploads((prev) =>
                                        prev.map((p) => (p.id === pending.id ? { ...p, docId: null } : p))
                                      );
                                      setOpenPendingDocId(null);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        pending.docId === null ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    Other
                                  </CommandItem>
                                  {DRIVER_DOCUMENT_PICKER.map((d) => (
                                    <CommandItem
                                      key={d.id}
                                      value={d.label}
                                      onSelect={() => {
                                        setPendingUploads((prev) =>
                                          prev.map((p) => (p.id === pending.id ? { ...p, docId: d.id } : p))
                                        );
                                        setOpenPendingDocId(null);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          pending.docId === d.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {d.label}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Remove"
                          onClick={() =>
                            setPendingUploads((prev) => prev.filter((p) => p.id !== pending.id))
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
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
              {isSearching ? 'No files match your search' : 'No files uploaded yet'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleFiles.map((file) => {
                const currentDocId = (file.keywords || []).find((k) => getDocumentTypeById(k)) || "";
                const currentDoc = currentDocId ? getDocumentTypeById(currentDocId) : null;
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
                                {DRIVER_DOCUMENT_PICKER.map((doc) => (
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
