import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Image as ImageIcon, Play, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { pretripWeekStart, pretripWeekEnd } from "@/lib/pretripDates";
import { cn } from "@/lib/utils";
import { groupPretripPhotosByForm } from "@/lib/pretripPhotoGroups";
import { photoReuseMessage, pretripPhotoHash, type PretripPhotoReuse } from "@/lib/pretripPhotoReuse";
import { latestDailyPretripSubmissions } from "@/lib/pretripSubmissions";
import { isPretripVideo } from "@/lib/pretripMedia";

type Photo = { id: string; truck_id: string; file_path: string; file_name: string | null; content_type?: string | null; photo_category?: string | null; form_submission_id?: string | null; content_sha256?: string | null; reuse?: PretripPhotoReuse; reuse_check_failed?: boolean };

export const usePretripPhotos = (date: string, submissions?: {id:string}[], enabled=true) =>
  useQuery({
    queryKey: ["pretrip-photos", pretripWeekStart(date), submissions?.map(s=>s.id).sort()],
    enabled,
    queryFn: async () => {
      const data: Photo[] = [];
      // A week can contain several thousand photos; fetch every page.
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await (supabase as any)
          .from("pretrip_photos")
          .select("id, truck_id, file_path, file_name, content_type, photo_category, form_submission_id, content_sha256")
          .gte("inspection_date", pretripWeekStart(date))
          .lte("inspection_date", pretripWeekEnd(date))
          .order("created_at").order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        data.push(...(page ?? []));
        if ((page ?? []).length < 1000) break;
      }
      const reused = new Map<string, PretripPhotoReuse>();
      let reuseCheckFailed = false;
      // Query prior weeks on the server under the viewer's existing RLS policies.
      // A failed comparison must not hide the successfully loaded photos.
      try {
        for (let offset = 0; data.length; offset += 1000) {
          const { data: matches, error } = await (supabase as any)
            .rpc("get_pretrip_photo_reuse", { _week_start: pretripWeekStart(date) })
            .range(offset, offset + 999);
          if (error) throw error;
          for (const match of (matches ?? []) as PretripPhotoReuse[]) reused.set(match.photo_id, match);
          if ((matches ?? []).length < 1000) break;
        }
      } catch {
        reuseCheckFailed = true;
      }
      const map: Record<string, Photo[]> = {};
      const visibleIds = submissions && new Set(submissions.map(s=>s.id));
      data.filter(p=>!p.form_submission_id||!visibleIds||visibleIds.has(p.form_submission_id)).forEach((p) => { (map[p.truck_id] ||= []).push({ ...p, reuse: reused.get(p.id), reuse_check_failed: reuseCheckFailed }); });
      return map;
    },
  });

type FormPictureSubmission = { id: string; driver_name: string; submitted_at: string; inspection_date?:string|null };
const EMPTY_FORM_PICTURE_SUBMISSIONS: FormPictureSubmission[] = [];

export const PretripPhotosCell = ({ truckId, photos, userId, date, submissions }: { truckId: string; photos: Photo[]; userId?: string; date: string; submissions?: FormPictureSubmission[] }) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [warmUrls, setWarmUrls] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const allSubmissions = submissions ?? EMPTY_FORM_PICTURE_SUBMISSIONS;
  const formSubmissions = useMemo(()=>latestDailyPretripSubmissions(allSubmissions),[allSubmissions]);
  const visiblePhotos = useMemo(()=>{
    const visibleIds=new Set(formSubmissions.map(s=>s.id));
    const hiddenIds=new Set(allSubmissions.filter(s=>!visibleIds.has(s.id)).map(s=>s.id));
    return photos.filter(p=>!p.form_submission_id||!hiddenIds.has(p.form_submission_id));
  },[photos,allSubmissions,formSubmissions]);
  const photoGroups = useMemo(() => groupPretripPhotosByForm(visiblePhotos, formSubmissions), [visiblePhotos, formSubmissions]);
  const activeGroup = photoGroups.find((group) => group.id === activeGroupId) ?? photoGroups[0];
  const galleryPhotos = activeGroup?.photos ?? [];
  const selectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    setIdx(0);
    setPreviewReady(false);
    setFailedUrl(undefined);
  };

  const paths = galleryPhotos.map((photo) => photo.file_path);
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
        const content_sha256 = await pretripPhotoHash(await f.arrayBuffer());
        const safe = f.name.replace(/[\s-]+/g, "_");
        const path = `${truckId}/${date}/${Date.now()}_${safe}`;
        const { error } = await supabase.storage.from("pretrip-photos").upload(path, f);
        if (error) throw error;
        const { error: e2 } = await (supabase as any)
          .from("pretrip_photos")
          .insert({ truck_id: truckId, file_path: path, file_name: f.name, content_type:f.type||null, uploaded_by: userId, inspection_date: date, content_sha256 });
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

  const current = galleryPhotos[Math.min(idx, galleryPhotos.length - 1)];
  const currentUrl = current ? urls[current.file_path] : undefined;

  // Fetch the adjacent originals after the selected photo has loaded.
  useEffect(() => {
    if (!open || !previewReady) return;
    for (const neighbor of [galleryPhotos[idx - 1], galleryPhotos[idx + 1]]) {
      const url = neighbor && urls[neighbor.file_path];
      if (url && !isPretripVideo(neighbor)) {
        const image = new window.Image();
        image.src = url;
      }
    }
  }, [open, previewReady, idx, galleryPhotos, urls]);

  const remove = async () => {
    if (!current || !confirm("Delete this picture?")) return;
    const { error } = await (supabase as any).from("pretrip_photos").delete().eq("id", current.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    await supabase.storage.from("pretrip-photos").remove([current.file_path]);
    qc.invalidateQueries({ queryKey: ["pretrip-photos"] });
      qc.invalidateQueries({ queryKey: ["pretrip-missing-count"] });
    if (galleryPhotos.length <= 1) setOpen(false);
    setIdx((i) => Math.max(0, i - 1));
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 max-w-full px-2 text-[10px]" disabled={!visiblePhotos.length}
          title="Open inspection pictures"
          onPointerEnter={() => { if (!open) setActiveGroupId(photoGroups[0]?.id ?? null); setWarmUrls(true); }}
          onFocus={() => { if (!open) setActiveGroupId(photoGroups[0]?.id ?? null); setWarmUrls(true); }}
          onClick={() => { selectGroup(photoGroups[0].id); setOpen(true); }}>
          <ImageIcon className="mr-1 h-3.5 w-3.5 shrink-0" /> Pictures ({visiblePhotos.length})
        </Button>
        {visiblePhotos.some((photo) => photo.reuse) && (
          <span role="img" aria-label="Reused photo warning" className="shrink-0 text-amber-600 dark:text-amber-400"
            title={visiblePhotos.filter((photo) => photo.reuse).map((photo) => photoReuseMessage(photo.reuse!)).join("\n")}>
            <AlertTriangle className="h-4 w-4" />
          </span>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={uploading}
        onClick={() => fileRef.current?.click()} title="Add pictures">
        <Plus className="h-4 w-4" />
      </Button>
      <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple className="hidden"
        onChange={(e) => upload(e.target.files)} />

      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setWarmUrls(false); }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl max-h-[calc(100dvh-1rem)] overflow-hidden gap-3 p-3 sm:p-5">
          <DialogHeader className="min-w-0 pr-8 text-left">
            <DialogTitle>{activeGroup?.label === "Pictures" ? "Photos" : `Photos · ${activeGroup?.label}`} ({galleryPhotos.length ? Math.min(idx + 1, galleryPhotos.length) : 0} / {galleryPhotos.length})</DialogTitle>
            <p className="truncate text-sm text-muted-foreground" title={current?.photo_category ?? current?.file_name ?? ""}>
              {current?.photo_category || current?.file_name || "Inspection photo"}
            </p>
          </DialogHeader>
          {photoGroups.length > 1 && (
            <div className="min-w-0 overflow-x-auto overscroll-x-contain pb-1" role="group" aria-label="Photo submissions">
              <div className="flex w-max gap-2">
                {photoGroups.map((group) => (
                  <Button key={group.id} variant={group.id === activeGroup?.id ? "default" : "outline"} size="sm"
                    aria-pressed={group.id === activeGroup?.id} aria-label={`${group.label} (${group.photos.length})`}
                    title={group.title} onClick={() => selectGroup(group.id)}>
                    {group.label} ({group.photos.length})
                    {group.photos.some((photo) => photo.reuse) && <AlertTriangle className="ml-1 h-4 w-4" aria-label="Contains reused photos" />}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {current?.reuse ? (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div><p className="font-semibold">Photo reused from an earlier week</p><p>{photoReuseMessage(current.reuse)}</p></div>
            </div>
          ) : current?.reuse_check_failed ? (
            <p role="status" className="text-sm text-muted-foreground">Photo reuse check unavailable. Refresh to try again.</p>
          ) : current && !current.content_sha256 ? (
            <p role="status" className="text-sm text-muted-foreground">Photo reuse check pending.</p>
          ) : null}
          <div className="relative min-w-0 h-[min(60dvh,640px)] overflow-hidden rounded-lg bg-black/30">
            {currentUrl && current && isPretripVideo(current) ? (
              <video key={currentUrl} src={currentUrl} controls playsInline preload="metadata"
                aria-label={current.photo_category || current.file_name || "Inspection video"}
                className="absolute inset-0 h-full w-full object-contain"
                onLoadedData={()=>setPreviewReady(true)} onError={()=>{setFailedUrl(currentUrl);setPreviewReady(true);}} />
            ) : currentUrl ? (
              <img key={currentUrl} src={currentUrl} alt={current?.photo_category || current?.file_name || "Inspection photo"}
                loading="eager" {...{ fetchpriority: "high" }} decoding="async"
                className="absolute inset-0 h-full w-full object-contain"
                onLoad={() => setPreviewReady(true)} onError={() => { setFailedUrl(currentUrl); setPreviewReady(true); }} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {urlsError ? <Button variant="outline" onClick={() => retryUrls()}>Retry loading photos</Button> : "Loading photo…"}
              </div>
            )}
            {failedUrl === currentUrl && currentUrl && <div className="absolute inset-0 flex items-center justify-center bg-background/90 px-4 text-center text-sm">{current&&isPretripVideo(current)?"This video format cannot play in this browser. Use Download to open the original.":"Could not load this photo."}</div>}
            <Button aria-label="Previous photo" variant="secondary" size="icon" className="absolute left-2 top-1/2 -translate-y-1/2 shadow-md"
              disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-5 w-5" /></Button>
            <Button aria-label="Next photo" variant="secondary" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 shadow-md"
              disabled={idx >= galleryPhotos.length - 1} onClick={() => setIdx(idx + 1)}><ChevronRight className="h-5 w-5" /></Button>
          </div>
          <div className="min-w-0 overflow-x-auto overscroll-x-contain pb-1">
            <div className="flex w-max gap-2">
              {galleryPhotos.map((p, i) => (
                <button key={p.id} onClick={() => setIdx(i)} aria-label={`View photo ${i + 1}`} aria-pressed={i === idx}
                  title={p.reuse ? photoReuseMessage(p.reuse) : undefined}
                  className={cn("relative h-14 w-14 shrink-0 rounded-md border-2 overflow-hidden bg-muted", i === idx ? "border-primary" : p.reuse ? "border-amber-500" : "border-transparent")}>
                  {isPretripVideo(p)?<Play className="mx-auto h-5 w-5" aria-label="Video"/>:previewReady && urls[p.file_path] ? <img src={urls[p.file_path]} alt="" loading="lazy" {...{ fetchpriority: "low" }} decoding="async" className="h-full w-full object-cover" />
                    : <span className="text-xs text-muted-foreground">{i + 1}</span>}
                  {p.reuse && <AlertTriangle className="absolute right-0.5 top-0.5 h-4 w-4 rounded-sm bg-amber-50 text-amber-700" />}
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
