import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddOrderSalaryChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}

interface OrderData {
  id: string;
  booked_by: string | null;
  delivery_datetime: string | null;
  freight_amount: number | null;
  driver_price: number | null;
  internal_load_number: string | null;
}

function formatChicagoMonth(iso: string): string {
  // Returns YYYY-MM in America/Chicago
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  return `${year}-${month}`;
}

function formatChicagoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AddOrderSalaryChargeDialog({ open, onOpenChange, orderId }: AddOrderSalaryChargeDialogProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [percent, setPercent] = useState<string>("50");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      setPercent("50");
      setReason("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, booked_by, delivery_datetime, freight_amount, driver_price, internal_load_number")
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.error("Failed to load order");
        return;
      }
      setOrder(data as OrderData);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const freight = Number(order?.freight_amount || 0);
  const driverPay = Number(order?.driver_price || 0);
  const pct = Math.max(0, Math.min(100, parseFloat(percent) || 0));
  const computedAmount = useMemo(() => {
    const base = freight * 0.01 + (freight - driverPay) * 0.05;
    const raw = base * (pct / 100);
    return Math.max(0, raw);
  }, [freight, driverPay, pct]);

  const month = order?.delivery_datetime ? formatChicagoMonth(order.delivery_datetime) : "";
  const deliveryDisplay = order?.delivery_datetime ? formatChicagoDate(order.delivery_datetime) : "—";

  const canSave =
    !!order?.booked_by &&
    !!order?.delivery_datetime &&
    reason.trim().length > 0 &&
    pct >= 0 &&
    pct <= 100 &&
    !saving;

  const handleSave = async () => {
    if (!order || !order.booked_by || !order.delivery_datetime) return;
    setSaving(true);
    try {
      // Resolve booked_by → user_id via profiles.full_name (or by user_id if it's already a UUID)
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let userId: string | null = null;
      if (uuidRe.test(order.booked_by)) {
        const { data: p } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .eq("user_id", order.booked_by)
          .maybeSingle();
        userId = (p as any)?.user_id || null;
      }
      if (!userId) {
        const { data: p2 } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("full_name", order.booked_by)
          .maybeSingle();
        userId = (p2 as any)?.user_id || null;
      }
      if (!userId) {
        toast.error(`Could not resolve "${order.booked_by}" to a user`);
        setSaving(false);
        return;
      }

      const monthStr = formatChicagoMonth(order.delivery_datetime);

      // Read existing salary row
      const { data: existing } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("id, additionals")
        .eq("user_id", userId)
        .eq("month", monthStr)
        .maybeSingle();

      const newEntry = {
        type: "charge" as const,
        amount: Number(computedAmount.toFixed(2)),
        reason: reason.trim(),
        order_id: order.id,
        percent: pct,
        source: "order_charge",
        created_at: new Date().toISOString(),
      };

      if (existing) {
        const current = Array.isArray((existing as any).additionals) ? ((existing as any).additionals as any[]) : [];
        const updated = [...current, newEntry];
        const { error: upErr } = await supabase
          .from("dispatcher_salary_payments" as any)
          .update({ additionals: updated })
          .eq("id", (existing as any).id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase
          .from("dispatcher_salary_payments" as any)
          .insert({
            user_id: userId,
            month: monthStr,
            paid_amount: 0,
            additionals: [newEntry],
          });
        if (insErr) throw insErr;
      }

      toast.success(`Charge of $${computedAmount.toFixed(2)} added to ${order.booked_by} for ${monthStr}`);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Add salary charge failed", err);
      toast.error(err?.message || "Failed to add charge");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Salary Charge</DialogTitle>
          <DialogDescription>
            Create a charge on the booker's monthly salary based on this load.
          </DialogDescription>
        </DialogHeader>

        {loading || !order ? (
          <div className="text-sm text-muted-foreground py-4">Loading order…</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
              <div><span className="text-muted-foreground">Load:</span> #{order.internal_load_number || "—"}</div>
              <div><span className="text-muted-foreground">Booked by:</span> {order.booked_by || <span className="text-destructive">missing</span>}</div>
              <div><span className="text-muted-foreground">Delivery:</span> {deliveryDisplay}{month && <> · <span className="text-muted-foreground">month</span> {month}</>}</div>
              <div><span className="text-muted-foreground">Freight:</span> ${freight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div><span className="text-muted-foreground">Driver Pay:</span> ${driverPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="charge-percent">Percentage (0–100)</Label>
              <Input
                id="charge-percent"
                type="number"
                min={0}
                max={100}
                step="1"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="charge-reason">Reason</Label>
              <Textarea
                id="charge-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this charge?"
                rows={3}
              />
            </div>

            <div className="rounded-md border p-3 text-sm bg-primary/5">
              <div className="text-muted-foreground text-xs">Formula: (Freight × 1% + (Freight − Driver Pay) × 5%) × Percentage</div>
              <div className="text-lg font-semibold mt-1">
                Charge: ${computedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {!order.booked_by && (
              <div className="text-xs text-destructive">No booker on this order — cannot create a charge.</div>
            )}
            {!order.delivery_datetime && (
              <div className="text-xs text-destructive">No delivery date on this order — cannot determine month.</div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving…" : "Add Charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddOrderSalaryChargeDialog;