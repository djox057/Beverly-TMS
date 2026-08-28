import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { sanitizeFileName } from "@/utils/orderFilesUpload";

const BUCKET = "company-coi";
const ACCEPT = ".pdf,image/*";

type CoiFile = {
  id: string;
  file_name: string;
  file_path: string;
  created_at: string;
  uploaded_by: string | null;
};

export const CompanyCoiSection = ({ companyName }: { companyName: string }) => {
  const { roles, profile, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = roles.includes("admin");
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<CoiFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("company_coi_files")
      .select("id, file_name, file_path, created_at, uploaded_by")
      .eq("company_name", companyName)
      .order("created_at", { ascending: false });
    if (error) console.error("[COI] load failed:", error.message);
    setFiles((data as CoiFile[]) || []);
    setLoading(false);
  }, [companyName]);

  useEffect(() => {
    load();
  }, [load]);

  const openFile = async (file: CoiFile) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.file_path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not open file", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const isAllowed = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!isAllowed) {
      toast({ title: "Invalid file type", description: "Only PDF or image files are allowed.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const safeName = sanitizeFileName(file.name) || "coi.pdf";
      const path = `${sanitizeFileName(companyName)}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("company_coi_files").insert({
        company_name: companyName,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        content_type: file.type || null,
        uploaded_by: profile?.full_name || user?.email || null,
      });
      if (insErr) throw insErr;

      toast({ title: "COI uploaded" });
      await load();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (file: CoiFile) => {
    if (!window.confirm(`Delete ${file.file_name}?`)) return;
    const { error } = await supabase.from("company_coi_files").delete().eq("id", file.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.storage.from(BUCKET).remove([file.file_path]);
    toast({ title: "COI deleted" });
    await load();
  };

  return (
    <div className="pt-2 border-t space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">COI</span>
        {isAdmin && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              <span className="ml-1 text-xs">Upload</span>
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No COI uploaded.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => openFile(f)}
                className="flex items-center gap-1 underline hover:no-underline text-left break-all"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>{f.file_name}</span>
              </button>
              {isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => handleDelete(f)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
