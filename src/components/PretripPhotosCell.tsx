import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { pretripWeekStart, pretripWeekEnd } from "@/lib/pretripDates";
import { cn } from "@/lib/utils";

type Photo = { id: string; truck_id: string; file_path: string; file_name: string | null; photo_category?: string | null };

export const usePretripPhotos = (date: string) =>
  useQuery({
    queryKey: ["pretrip-photos", pretripWeekStart(date)],
    queryFn: async () => {
      const data: Photo[] = [];
      // A week can contain several thousand photos; fetch every page.
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await (supabase as any)
          .from("pretrip_photos")
          .select("id, truck_id, file_path, file_name, photo_category")
          .gte("inspection_date", pretripWeekStart(date))
          .lte("inspection_date", pretripWeekEnd(date))
          .order("created_at").order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        data.push(...(page ?? []));
        if ((page ?? []).length < 1000) break;
      }
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
  const [warmUrls, setWarmUrls] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  const [uploading, setUploading] = useState(false);

  const paths = photos.map((photo) => photo.file_path);
  const { data: urls = {}, isError: urlsError, refetch: retryUrls } = useQuery({
    queryKey: ["pretrip-photo-urls", paths],
    enabled: (open || warmUrls) && paths.length > 0,
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("pretrip-photos").createSignedUrls(paths, 3600);
      if (error) throw error;
      return Object.fromEntries((data ?? []).filter((item) => item.path && item.signedUrl)
        .map((item) => [item.path!, item.signedUrl]));
    },
  });

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

  // Fetch the adjacent originals after the selected photo has loaded.
  useEffect(() => {
    if (!open || !previewReady) return;
    for (const neighbor of [photos[idx - 1], photos[idx + 1]]) {
      const url = neighbor && urls[neighbor.file_path];
      if (url) {
        const image = new window.Image();
        image.src = url;
      }
    }
  }, [open, previewReady, idx, photos, urls]);

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
        onPointerEnter={() => setWarmUrls(true)} onFocus={() => setWarmUrls(true)}
        onClick={() => { setIdx(0); setPreviewReady(false); setFailedUrl(undefined); setOpen(true); }}>
        <ImageIcon className="h-4 w-4 mr-1" /> Pictures ({photos.length})
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={uploading}
        onClick={() => fileRef.current?.click()} title="Add pictures">
        <Plus className="h-4 w-4" />
      </Button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => upload(e.target.files)} />

      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setWarmUrls(false); }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl max-h-[calc(100dvh-1rem)] overflow-hidden gap-3 p-3 sm:p-5">
          <DialogHeader className="min-w-0 pr-8 text-left">
            <DialogTitle>Photos ({photos.length ? Math.min(idx + 1, photos.length) : 0} / {photos.length})</DialogTitle>
            <p className="truncate text-sm text-muted-foreground" title={current?.photo_category ?? current?.file_name ?? ""}>
              {current?.photo_category || current?.file_name || "Inspection photo"}
            </p>
          </DialogHeader>
          <div className="relative min-w-0 h-[min(60dvh,640px)] overflow-hidden rounded-lg bg-black/30">
            {currentUrl ? (
              <img key={currentUrl} src={currentUrl} alt={current?.photo_category || current?.file_name || "Inspection photo"}
                loading="eager" {...{ fetchpriority: "high" }} decoding="async"
                className="absolute inset-0 h-full w-full object-contain"
                onLoad={() => setPreviewReady(true)} onError={() => { setFailedUrl(currentUrl); setPreviewReady(true); }} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {urlsError ? <Button variant="outline" onClick={() => retryUrls()}>Retry loading photos</Button> : "Loading photo…"}
              </div>
            )}
            {failedUrl === currentUrl && currentUrl && <div className="absolute inset-0 flex items-center justify-center bg-background/90 text-sm">Could not load this photo.</div>}
            <Button aria-label="Previous photo" variant="secondary" size="icon" className="absolute left-2 top-1/2 -translate-y-1/2 shadow-md"
              disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-5 w-5" /></Button>
            <Button aria-label="Next photo" variant="secondary" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 shadow-md"
              disabled={idx >= photos.length - 1} onClick={() => setIdx(idx + 1)}><ChevronRight className="h-5 w-5" /></Button>
          </div>
          <div className="min-w-0 overflow-x-auto overscroll-x-contain pb-1">
            <div className="flex w-max gap-2">
              {photos.map((p, i) => (
                <button key={p.id} onClick={() => setIdx(i)} aria-label={`View photo ${i + 1}`} aria-pressed={i === idx}
                  className={cn("h-14 w-14 shrink-0 rounded-md border-2 overflow-hidden bg-muted", i === idx ? "border-primary" : "border-transparent")}>
                  {previewReady && urls[p.file_path] ? <img src={urls[p.file_path]} alt="" loading="lazy" {...{ fetchpriority: "low" }} decoding="async" className="h-full w-full object-cover" />
                    : <span className="text-xs text-muted-foreground">{i + 1}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2 border-t pt-3">
            <Button variant="outline" size="sm" disabled={!currentUrl} asChild={!!currentUrl}>
              {currentUrl ? <a href={currentUrl} download={current?.file_name ?? "photo"} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" />Download</a>
                : <span><Download className="h-4 w-4 mr-1" />Download</span>}
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={remove}>
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
