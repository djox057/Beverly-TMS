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
import { Checkbox } from "@/components/ui/checkbox";

// Format a Date into a value acceptable by <input type="datetime-local"> in local time.
const toLocalInputValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const defaultExpiry = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return toLocalInputValue(d);
};

const extractMessageFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const details = data.details;

  if (typeof details === "string" && details.trim()) {
    try {
      const parsed = JSON.parse(details) as Record<string, unknown>;
      if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
      if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
    } catch {
      return details;
    }
  }

  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  return null;
};

const getFunctionErrorMessage = async (error: unknown): Promise<string> => {
  const fallback = error instanceof Error ? error.message : "Failed to create live share link";
  const context = (error as { context?: unknown })?.context;

  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      return extractMessageFromPayload(payload) || fallback;
    } catch {
      try {
        const text = await context.clone().text();
        return text || fallback;
      } catch {
        return fallback;
      }
    }
  }

  return fallback;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckNumber: string;
}

export function SamsaraLiveShareDialog({ open, onOpenChange, truckNumber }: Props) {
  const paddedTruck = String(truckNumber || "").replace(/^#/, "").padStart(5, "0");
  const [pageTitle, setPageTitle] = useState<string>(`TRUCK ${paddedTruck}`);
  const [includeExpiration, setIncludeExpiration] = useState<boolean>(true);
  const [expiryLocal, setExpiryLocal] = useState<string>(defaultExpiry());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      let expiresAtIso: string | undefined;
      if (includeExpiration) {
        const t = new Date(expiryLocal);
        if (!expiryLocal || Number.isNaN(t.getTime())) throw new Error("Invalid expiration date");
        if (t.getTime() <= Date.now()) throw new Error("Expiration must be in the future");
        expiresAtIso = t.toISOString();
      }
      const { data, error } = await supabase.functions.invoke("samsara-live-share", {
        body: {
          truck_number: truckNumber,
          expires_at: expiresAtIso,
          name: pageTitle.trim() || `TRUCK ${paddedTruck}`,
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (!data?.url) throw new Error("No URL returned");
      setResult({ url: data.url, expiresAt: data.expiresAt });
      try {
        await navigator.clipboard.writeText(data.url);
        toast.success("Live share link copied to clipboard");
      } catch {
        toast.success("Live share link created");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create live share link";
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
      setPageTitle(`TRUCK ${paddedTruck}`);
      setIncludeExpiration(true);
      setExpiryLocal(defaultExpiry());
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
              <Label htmlFor="ls-page-title">Page title</Label>
              <Input
                id="ls-page-title"
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ls-include-exp"
                  checked={includeExpiration}
                  onCheckedChange={(v) => setIncludeExpiration(v === true)}
                  disabled={loading}
                />
                <Label htmlFor="ls-include-exp" className="font-normal cursor-pointer">
                  Include link expiration date
                </Label>
              </div>
              {includeExpiration && (
                <Input
                  type="datetime-local"
                  value={expiryLocal}
                  onChange={(e) => setExpiryLocal(e.target.value)}
                  disabled={loading}
                />
              )}
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