import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_TOTAL_PHOTO_BYTES } from "../../../supabase/functions/send-service-request/photos";

interface Preview {
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
}

interface Props {
  truckId: string;
  driverId: string;
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
  onClose: () => void;
}

const acceptedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const photoType = (file: File) => file.type || ({
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
} as Record<string, string>)[file.name.split(".").pop()?.toLowerCase() || ""] || "";
const encodePhoto = (file: File): Promise<{ name: string; type: string; content: string }> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: photoType(file), content: String(reader.result).split(",")[1] || "" });
  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
  reader.readAsDataURL(file);
});

export function ServiceRequestDialog({ truckId, driverId, driverName, truckNumber, trailerNumber: initialTrailer, onClose }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [enteredDriverName, setEnteredDriverName] = useState(driverName);
  const [enteredTruckNumber, setEnteredTruckNumber] = useState(truckNumber);
  const [trailerNumber, setTrailerNumber] = useState(initialTrailer);
  const [repairInfo, setRepairInfo] = useState("");
  const [underLoad, setUnderLoad] = useState<boolean | null>(null);
  const [deliveryTime, setDeliveryTime] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [loadNote, setLoadNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase.functions.invoke<Preview>("send-service-request", {
      body: { action: "preview", truckId, driverId },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data || "error" in data) {
        setLoadError("Could not verify the current driver assignment. Refresh Reports and reopen this form.");
      } else {
        setEnteredDriverName(data.driverName || driverName);
        setEnteredTruckNumber(data.truckNumber || truckNumber);
        setTrailerNumber(data.trailerNumber || initialTrailer);
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setLoadError("Could not verify the current driver assignment. Refresh Reports and reopen this form.");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [truckId, driverId, initialTrailer, driverName, truckNumber]);

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...photos, ...Array.from(files)];
    if (next.length > MAX_PHOTOS || next.some((file) => !acceptedPhotoTypes.has(photoType(file)) || file.size > MAX_PHOTO_BYTES) ||
        next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_PHOTO_BYTES) {
      toast({ title: "Photos not added", description: `Choose up to ${MAX_PHOTOS} JPG, PNG, WebP, HEIC, or HEIF photos (5 MB each, 12 MB total).`, variant: "destructive" });
      return;
    }
    setPhotos(next);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || loadError || underLoad === null || !enteredDriverName.trim() || !enteredTruckNumber.trim() || !repairInfo.trim() ||
        (underLoad && (!deliveryTime.trim() || !deliveryLocation.trim()))) return;
    setSending(true);
    try {
      const attachments = await Promise.all(photos.map(encodePhoto));
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>("send-service-request", {
        body: {
          action: "send", truckId, driverId, trailerNumber: trailerNumber.trim(),
          driverName: enteredDriverName.trim(), truckNumber: enteredTruckNumber.trim(),
          repairInfo: repairInfo.trim(), underLoad,
          deliveryTime: underLoad ? deliveryTime.trim() : "",
          deliveryLocation: underLoad ? deliveryLocation.trim() : "",
          loadNote: loadNote.trim(), photos: attachments,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || "Email was not accepted. Please try again.");
      toast({ title: "Service request sent", description: "The request was emailed successfully." });
      onClose();
    } catch (error) {
      toast({ title: "Service request failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !sending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Service Request</DialogTitle>
          <DialogDescription>Describe the repair and note any details about the current or next load.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="service-driver">Driver</Label><Input id="service-driver" value={enteredDriverName} onChange={(e) => setEnteredDriverName(e.target.value)} maxLength={120} required /></div>
            <div className="space-y-1"><Label htmlFor="service-truck">Truck</Label><Input id="service-truck" value={enteredTruckNumber} onChange={(e) => setEnteredTruckNumber(e.target.value)} maxLength={60} required /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="service-trailer">Trailer</Label><Input id="service-trailer" value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} maxLength={60} placeholder="Not assigned (optional)" /></div>
          <div className="space-y-1"><Label htmlFor="service-repair">Repair info — describe the issue the driver is having</Label><Textarea id="service-repair" value={repairInfo} onChange={(e) => setRepairInfo(e.target.value)} maxLength={5000} rows={4} required /></div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Is the driver under a load?</legend>
            <div className="flex gap-2">
              <Button type="button" variant={underLoad === true ? "default" : "outline"} aria-pressed={underLoad === true} onClick={() => setUnderLoad(true)}>Yes</Button>
              <Button type="button" variant={underLoad === false ? "default" : "outline"} aria-pressed={underLoad === false} onClick={() => setUnderLoad(false)}>No</Button>
            </div>
            <p className="text-xs text-muted-foreground">Under a load means freight has been picked up and has not been fully delivered or handed off.</p>
          </fieldset>
          {loading && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Checking driver assignment…</p>}
          {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
          {underLoad === true && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label htmlFor="service-delivery-time">Delivery time (TMS local appointment)</Label>
                <Input id="service-delivery-time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} maxLength={150} placeholder="MM/DD/YYYY HH:MM" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="service-delivery-location">Delivery location</Label>
                <Input id="service-delivery-location" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} maxLength={500} placeholder="Street, city, state" required />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="service-load-note">Note for load/next load</Label>
            <Textarea id="service-load-note" value={loadNote} onChange={(e) => setLoadNote(e.target.value)} maxLength={5000} rows={4} placeholder="Optional details about the current or next load" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-photos">Photos (optional)</Label>
            <Input id="service-photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple disabled={sending} onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            <p className="text-xs text-muted-foreground">Up to 6 photos, 5 MB each and 12 MB total. Photos are attached to the email.</p>
            {photos.map((photo, index) => (
              <div key={`${photo.name}-${index}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{photo.name}</span>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${photo.name}`} disabled={sending} onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={sending} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || !!loadError || sending || underLoad === null || !enteredDriverName.trim() || !enteredTruckNumber.trim() || !repairInfo.trim() || (underLoad && (!deliveryTime.trim() || !deliveryLocation.trim()))}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send Service Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
