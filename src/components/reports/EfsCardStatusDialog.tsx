import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { CONTROLLABLE_STATUSES, type ControllableStatus } from "@/lib/efs/cardStatus";

interface CardStatusResponse {
  truckId: string;
  configured?: boolean;
  reason?: string;
  message?: string;
  maskedCardNumber?: string | null;
  rawStatus?: string | null;
  controllableStatus?: ControllableStatus | null;
  canControl?: boolean;
  uncontrollableMessage?: string | null;
  checkedAt?: string | null;
  source?: string;
  canChange?: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckId: string | null;
  truckNumber?: string | null;
  driverName?: string | null;
}

const formatChecked = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

export function EfsCardStatusDialog({ open, onOpenChange, truckId, truckNumber, driverName }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<CardStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ControllableStatus | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!truckId || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("efs-card-status", {
        body: { action: "get", truckId },
      });
      if (error) throw error;
      setData(res as CardStatusResponse);
      if ((res as CardStatusResponse)?.error) setLoadError((res as CardStatusResponse).error!);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not reach the fuel-card service");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [truckId]);

  useEffect(() => {
    if (open && truckId) {
      setData(null);
      void load();
    }
  }, [open, truckId, load]);

  const applyStatus = async (status: ControllableStatus) => {
    if (!truckId || saving) return;
    setSaving(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("efs-card-status", {
        body: { action: "set", truckId, status, requestId: crypto.randomUUID() },
      });
      if (error) throw error;
      const result = res as CardStatusResponse;
      if (result?.error) {
        toast({ title: "Status not changed", description: result.error, variant: "destructive" });
      } else {
        toast({ title: `Card set to ${result.rawStatus ?? status}`, description: `Unit ${truckNumber ?? ""}`.trim() });
      }
      // Never trust an optimistic value — re-read the authoritative status.
      await load();
    } catch (e) {
      toast({
        title: "Status not changed",
        description: e instanceof Error ? e.message : "The fuel-card service rejected the change",
        variant: "destructive",
      });
      await load();
    } finally {
      setSaving(false);
      setPendingStatus(null);
    }
  };

  const controllable = data?.canControl === true;
  const current = data?.controllableStatus ?? null;
  const canChange = data?.canChange === true;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              EFS Fuel Card
            </DialogTitle>
            <DialogDescription className="text-xs">
              Unit {truckNumber || "—"}
              {driverName ? ` · ${driverName}` : ""}
            </DialogDescription>
          </DialogHeader>

          {loading && !data ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : data?.configured === false ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                <span>{data.message || "No EFS card is configured for this truck."}</span>
              </div>
            </div>
          ) : loadError && !data?.rawStatus ? (
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {loadError}
              </div>
              <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="text-muted-foreground text-xs">Card</div>
                  <div className="font-mono tabular-nums">{data?.maskedCardNumber || "—"}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-muted-foreground text-xs">Status</div>
                  <Badge
                    variant={current === "Active" ? "default" : current === "Hold" ? "secondary" : "destructive"}
                    className="uppercase"
                  >
                    {data?.rawStatus || "Unknown"}
                  </Badge>
                </div>
              </div>

              {!controllable && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                  {data?.uncontrollableMessage || "This card cannot be controlled from TMS"}
                </div>
              )}

              <div>
                <div className="mb-1.5 text-xs text-muted-foreground" id="efs-status-control-label">
                  Set status
                </div>
                <div
                  role="group"
                  aria-labelledby="efs-status-control-label"
                  className="inline-flex rounded-md border border-border p-0.5"
                >
                  {CONTROLLABLE_STATUSES.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={current === status ? "default" : "ghost"}
                      aria-pressed={current === status}
                      disabled={!controllable || !canChange || saving || current === status}
                      onClick={() => setPendingStatus(status)}
                      className="h-8 px-4 text-xs"
                    >
                      {saving && pendingStatus === status && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                      {status}
                    </Button>
                  ))}
                </div>
                {!canChange && controllable && (
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    You can view this card but not change its status.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  Checked {formatChecked(data?.checkedAt)}
                  {data?.source ? ` · ${data.source}` : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void load()}
                  disabled={loading || saving}
                  className="h-7 gap-1.5 px-2 text-xs"
                  aria-label="Refresh card status"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingStatus !== null} onOpenChange={(o) => !o && !saving && setPendingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus === "Hold" ? "Put this fuel card on hold?" : "Reactivate this fuel card?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Unit {truckNumber || "—"}
              {driverName ? ` · ${driverName}` : ""} · {data?.maskedCardNumber || "card"}.{" "}
              {pendingStatus === "Hold"
                ? "The driver will not be able to fuel until the card is set back to Active."
                : "The driver will be able to fuel again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                if (pendingStatus) void applyStatus(pendingStatus);
              }}
            >
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {pendingStatus === "Hold" ? "Put on hold" : "Set active"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default EfsCardStatusDialog;
