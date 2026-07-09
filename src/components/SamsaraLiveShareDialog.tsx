import { useState } from "react";
import { Share2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS: { value: string; label: string; hours: number }[] = [
  { value: "24", label: "24 hours", hours: 24 },
  { value: "72", label: "3 days", hours: 72 },
  { value: "168", label: "7 days", hours: 168 },
  { value: "336", label: "14 days", hours: 336 },
  { value: "720", label: "30 days", hours: 720 },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckNumber: string;
}

export function SamsaraLiveShareDialog({ open, onOpenChange, truckNumber }: Props) {
  const [hours, setHours] = useState<string>("168");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("samsara-live-share", {
        body: {
          truck_number: truckNumber,
          expires_in_hours: Number(hours),
          name: `TRUCK ${truckNumber}`,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No URL returned");
      setResult({ url: data.url, expiresAt: data.expiresAt });
      try {
        await navigator.clipboard.writeText(data.url);
        toast.success("Live share link copied to clipboard");
      } catch {
        toast.success("Live share link created");
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to create live share link";
      console.error("live-share error:", err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setResult(null);
      setHours("168");
    }
    onOpenChange(o);
  };

  const expiresLabel = result?.expiresAt
    ? new Date(result.expiresAt).toLocaleString()
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share Live Location — Truck #{truckNumber}
          </DialogTitle>
          <DialogDescription>
            Generates a public Samsara link anyone can open (no Samsara login needed) to see
            this truck's live location until it expires.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Expires after</Label>
              <Select value={hours} onValueChange={setHours} disabled={loading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Public link</Label>
              <div className="flex gap-2">
                <Input readOnly value={result.url} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy} title="Copy">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}
                  title="Open"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {expiresLabel && (
              <p className="text-xs text-muted-foreground">Expires: {expiresLabel}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate link
              </Button>
            </>
          ) : (
            <Button onClick={() => handleClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}