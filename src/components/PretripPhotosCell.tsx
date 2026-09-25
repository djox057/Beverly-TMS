import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Photo = { id: string; truck_id: string; file_path: string; file_name: string | null };

export const usePretripPhotos = (date: string) =>
  useQuery({
    queryKey: ["pretrip-photos", date],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pretrip_photos")
        .select("id, truck_id, file_path, file_name")
        .eq("inspection_date", date)
        .order("created_at");
      if (error) throw error;
      const map: Record<string, Photo[]> = {};
      (data ?? []).forEach((p: Photo) => { (map[p.truck_id] ||= []).push(p); });
      return map;
    },
  });

export const PretripPhotosCell = ({ truckId, photos, userId, date }: { truckId: string; photos: Photo[]; userId?: string; date: string }) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open || photos.length === 0) return;
    const missing = photos.filter((p) => !urls[p.file_path]).map((p) => p.file_path);
    if (!missing.length) return;
    supabase.storage.from("pretrip-photos").createSignedUrls(missing, 3600).then(({ data }) => {
      const next: Record<string, string> = {};
      (data ?? []).forEach((d) => { if (d.path && d.signedUrl) next[d.path] = d.signedUrl; });
      setUrls((u) => ({ ...u, ...next }));
    });
  }, [open, photos]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const safe = f.name.replace(/[\s-]+/g, "_");
        const path = `${truckId}/${date}/${Date.now()}_${safe}`;
        const { error } = await supabase.storage.from("pretrip-photos").upload(path, f);
        if (error) throw error;
        const { error: e2 } = await (supabase as any)
          .from("pretrip_photos")
          .insert({ truck_id: truckId, file_path: path, file_name: f.name, uploaded_by: userId, inspection_date: date });
        if (e2) throw e2;
      }
      qc.invalidateQueries({ queryKey: ["pretrip-photos"] });
      qc.invalidateQueries({ queryKey: ["pretrip-missing-count"] });
      toast({ title: "Pictures uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const current = photos[Math.min(idx, photos.length - 1)];
  const currentUrl = current ? urls[current.file_path] : undefined;

  const remove = async () => {
    if (!current || !confirm("Delete this picture?")) return;
    const { error } = await (supabase as any).from("pretrip_photos").delete().eq("id", current.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    await supabase.storage.from("pretrip-photos").remove([current.file_path]);
    qc.invalidateQueries({ queryKey: ["pretrip-photos"] });
      qc.invalidateQueries({ queryKey: ["pretrip-missing-count"] });
    if (photos.length <= 1) setOpen(false);
    setIdx((i) => Math.max(0, i - 1));
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" className="h-7 px-2" disabled={!photos.length}
        onClick={() => { setIdx(0); setOpen(true); }}>
        <ImageIcon className="h-4 w-4 mr-1" /> Pictures ({photos.length})
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={uploading}
        onClick={() => fileRef.current?.click()} title="Add pictures">
        <Plus className="h-4 w-4" />
      </Button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => upload(e.target.files)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Photos ({photos.length ? idx + 1 : 0} / {photos.length})</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 flex justify-center items-center h-[60vh] bg-muted rounded">
              {currentUrl ? <img src={currentUrl} alt={current?.file_name ?? ""} className="max-h-full max-w-full object-contain" />
                : <span className="text-muted-foreground">Loading...</span>}
            </div>
            <Button variant="outline" size="icon" disabled={idx >= photos.length - 1} onClick={() => setIdx(idx + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={!currentUrl} asChild={!!currentUrl}>
              {currentUrl ? <a href={currentUrl} download={current?.file_name ?? "photo"} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" />Download</a>
                : <span><Download className="h-4 w-4 mr-1" />Download</span>}
            </Button>
            <div className="flex-1 flex gap-2 overflow-x-auto">
              {photos.map((p, i) => (
                <button key={p.id} onClick={() => setIdx(i)}
                  className={cn("h-12 w-12 shrink-0 rounded border-2 overflow-hidden bg-muted", i === idx ? "border-primary" : "border-transparent")}>
                  {urls[p.file_path] && <img src={urls[p.file_path]} alt="" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
            <Button variant="outline" className="text-destructive" onClick={remove}>
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
