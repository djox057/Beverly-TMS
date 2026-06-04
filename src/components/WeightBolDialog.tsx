import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface WeightBolDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (weight: number) => void;
  defaultValue?: number | null;
  files?: File[] | FileList | null;
}

export const WeightBolDialog = ({ open, onCancel, onConfirm, defaultValue, files }: WeightBolDialogProps) => {
  const [value, setValue] = useState<string>("");

  useEffect(() => {
    if (open) {
      setValue(defaultValue != null ? String(defaultValue) : "");
    }
  }, [open, defaultValue]);

  const fileArray = useMemo<File[]>(() => {
    if (!files) return [];
    return Array.isArray(files) ? files : Array.from(files);
  }, [files]);

  const previews = useMemo(() => {
    if (!open || fileArray.length === 0) return [];
    return fileArray.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
  }, [open, fileArray]);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
    active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0,
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Don't hijack drag when interacting with iframe/links
    if (target.closest("iframe") || target.closest("a")) return;
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s.active) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = s.scrollLeft - (e.clientX - s.startX);
    el.scrollTop = s.scrollTop - (e.clientY - s.startY);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current.active = false;
    const el = scrollRef.current;
    if (el) {
      el.style.cursor = "grab";
      try { el.releasePointerCapture(e.pointerId); } catch {}
    }
  };

  const handleConfirm = () => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    onConfirm(num);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enter BOL Weight</DialogTitle>
          <DialogDescription>
            Enter the weight (lbs) from the Bill of Lading you are uploading.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="weight-bol-input">Weight (lbs)</Label>
          <Input
            id="weight-bol-input"
            type="number"
            min={0}
            step="any"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
            }}
            placeholder="e.g. 28000"
          />
        </div>
        {previews.length > 0 && (
          <div
            ref={scrollRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ cursor: "grab", touchAction: "none" }}
            className="space-y-2 max-h-[60vh] overflow-auto rounded-md border p-2 bg-muted/30 select-none"
          >
            <div className="text-xs font-medium text-muted-foreground">
              Uploaded BOL{previews.length > 1 ? "s" : ""} ({previews.length})
            </div>
            {previews.map(({ file, url }, i) => {
              const isImage = file.type.startsWith("image/");
              const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
              return (
                <div key={i} className="space-y-1">
                  <div className="text-xs text-muted-foreground truncate">{file.name}</div>
                  {isImage ? (
                    <img src={url} alt={file.name} draggable={false} className="max-h-[50vh] w-auto mx-auto rounded border pointer-events-none" />
                  ) : isPdf ? (
                    <iframe src={url} title={file.name} className="w-full h-[50vh] rounded border bg-background" />
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                      Open file
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!value || isNaN(parseFloat(value))}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Compare BOL weight to RC weight and return a warning message if the BOL weight
 * is more than 10% larger than the RC weight. Returns null if no warning is needed
 * (RC weight missing/zero, or BOL <= 110% of RC).
 */
export function getWeightDiscrepancyWarning(weightBol: number, weightRc: number | null | undefined): string | null {
  if (!weightRc || weightRc <= 0) return null;
  if (weightBol <= weightRc) return null;
  const diffPct = ((weightBol - weightRc) / weightRc) * 100;
  if (diffPct > 10) {
    return `BOL weight (${weightBol.toLocaleString()} lbs) is ${diffPct.toFixed(1)}% higher than RC weight (${weightRc.toLocaleString()} lbs). Please check the RC — the load might weigh more than listed.`;
  }
  return null;
}

export const SCALE_TICKET_THRESHOLD_LBS = 30000;

export function needsScaleTicket(weightBol: number | null | undefined, orderFiles: Array<{ file_category?: string }> | undefined): boolean {
  if (!weightBol || weightBol < SCALE_TICKET_THRESHOLD_LBS) return false;
  const hasAdditional = (orderFiles || []).some((f) => (f.file_category || "").toUpperCase() === "ADDITIONAL");
  return !hasAdditional;
}