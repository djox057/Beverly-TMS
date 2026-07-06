import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddOrderSalaryChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  onChanged?: () => void;
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

export function AddOrderSalaryChargeDialog({ open, onOpenChange, orderId, onChanged }: AddOrderSalaryChargeDialogProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [percent, setPercent] = useState<string>("50");
  const [reason, setReason] = useState<string>("");
  const [commAnnulment, setCommAnnulment] = useState(false);
  const [salaryRowId, setSalaryRowId] = useState<string | null>(null);
  const [salaryUserId, setSalaryUserId] = useState<string | null>(null);
  const [existingCharges, setExistingCharges] = useState<any[]>([]);
  const [allAdditionals, setAllAdditionals] = useState<any[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [grossPct, setGrossPct] = useState<number>(1); // dispatcher gross percent (e.g. 1 for 1%)
  const [cutPct, setCutPct] = useState<number>(5);     // dispatcher cut percent (e.g. 5 for 5%)

  const resetForm = () => {
    setPercent("50");
    setReason("");
    setCommAnnulment(false);
    setEditingIdx(null);
  };

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      resetForm();
      setSalaryRowId(null);
      setSalaryUserId(null);
      setExistingCharges([]);
      setAllAdditionals([]);
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
      if (error) {
        setLoading(false);
        toast.error("Failed to load order");
        return;
      }
      const ord = data as OrderData;
      setOrder(ord);

      // Resolve booker → user_id and load existing salary row + charges for this order
      if (ord?.booked_by && ord?.delivery_datetime) {
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let uid: string | null = null;
        if (uuidRe.test(ord.booked_by)) {
          const { data: p } = await supabase
            .from("profiles").select("user_id, gross_percent, cut_percent").eq("user_id", ord.booked_by).maybeSingle();
          uid = (p as any)?.user_id || null;
          if (!cancelled && p) {
            if ((p as any).gross_percent != null) setGrossPct(Number((p as any).gross_percent));
            if ((p as any).cut_percent != null) setCutPct(Number((p as any).cut_percent));
          }
        }
        if (!uid) {
          const { data: p2 } = await supabase
            .from("profiles").select("user_id, gross_percent, cut_percent").eq("full_name", ord.booked_by).maybeSingle();
          uid = (p2 as any)?.user_id || null;
          if (!cancelled && p2) {
            if ((p2 as any).gross_percent != null) setGrossPct(Number((p2 as any).gross_percent));
            if ((p2 as any).cut_percent != null) setCutPct(Number((p2 as any).cut_percent));
          }
        }
        if (uid) {
          const monthStr = formatChicagoMonth(ord.delivery_datetime);
          const { data: row } = await supabase
            .from("dispatcher_salary_payments" as any)
            .select("id, additionals")
            .eq("user_id", uid)
            .eq("month", monthStr)
            .maybeSingle();
          if (!cancelled) {
            setSalaryUserId(uid);
            setSalaryRowId((row as any)?.id || null);
            const adds = Array.isArray((row as any)?.additionals) ? ((row as any).additionals as any[]) : [];
            setAllAdditionals(adds);
            const existing = adds.filter((a) => a?.order_id === ord.id);
            setExistingCharges(existing);
            // Only one charge is allowed per load — auto-enter edit mode for it.
            if (existing.length > 0) {
              const e = existing[0];
              setEditingIdx(0);
              setReason(e.reason || "");
              setCommAnnulment(e.source === "comm_annulment");
              setPercent(String(e.order_percent ?? 50));
            }
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const freight = Number(order?.freight_amount || 0);
  const driverPay = Number(order?.driver_price || 0);
  const pct = Math.max(0, Math.min(100, parseFloat(percent) || 0));
  const grossRate = grossPct / 100;
  const cutRate = cutPct / 100;
  const formatPct = (v: number) => (Number.isInteger(v) ? v.toString() : (+v.toFixed(2)).toString());
  const computedAmount = useMemo(() => {
    if (commAnnulment) {
      return Math.max(0, (freight - driverPay) * cutRate);
    }
    const base = freight * grossRate + (freight - driverPay) * cutRate;
    const raw = base * (pct / 100);
    return Math.max(0, raw);
  }, [freight, driverPay, pct, commAnnulment, grossRate, cutRate]);

  const month = order?.delivery_datetime ? formatChicagoMonth(order.delivery_datetime) : "";
  const deliveryDisplay = order?.delivery_datetime ? formatChicagoDate(order.delivery_datetime) : "—";

  const canSave =
    !!order?.booked_by &&
    !!order?.delivery_datetime &&
    reason.trim().length > 0 &&
    (commAnnulment || (pct >= 0 && pct <= 100)) &&
    !saving;

  const handleSave = async () => {
    if (!order || !order.booked_by || !order.delivery_datetime) return;
    setSaving(true);
    try {
      let userId = salaryUserId;
      if (!userId) {
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRe.test(order.booked_by)) {
          const { data: p } = await supabase
            .from("profiles").select("user_id").eq("user_id", order.booked_by).maybeSingle();
          userId = (p as any)?.user_id || null;
        }
        if (!userId) {
          const { data: p2 } = await supabase
            .from("profiles").select("user_id").eq("full_name", order.booked_by).maybeSingle();
          userId = (p2 as any)?.user_id || null;
        }
      }
      if (!userId) {
        toast.error(`Could not resolve "${order.booked_by}" to a user`);
        setSaving(false);
        return;
      }

      const monthStr = formatChicagoMonth(order.delivery_datetime);

      const editingEntry = editingIdx !== null ? existingCharges[editingIdx] : null;
      const entry = {
        type: "charge" as const,
        amount: Number(computedAmount.toFixed(2)),
        reason: reason.trim(),
        order_id: order.id,
        order_percent: commAnnulment ? 0 : pct,
        source: commAnnulment ? "comm_annulment" : "order_charge",
        created_at: editingEntry?.created_at || new Date().toISOString(),
        ...(editingEntry ? { updated_at: new Date().toISOString() } : {}),
      };

      let updated: any[];
      if (editingEntry) {
        updated = allAdditionals.map((a) => (a === editingEntry ? entry : a));
      } else {
        updated = [...allAdditionals, entry];
      }

      if (salaryRowId) {
        const { error: upErr } = await supabase
          .from("dispatcher_salary_payments" as any)
          .update({ additionals: updated })
          .eq("id", salaryRowId);
        if (upErr) throw upErr;
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("dispatcher_salary_payments" as any)
          .insert({ user_id: userId, month: monthStr, paid_amount: 0, additionals: updated })
          .select("id")
          .maybeSingle();
        if (insErr) throw insErr;
        setSalaryRowId((ins as any)?.id || null);
        setSalaryUserId(userId);
      }

      setAllAdditionals(updated);
      setExistingCharges(updated.filter((a) => a?.order_id === order.id));
      onChanged?.();
      toast.success(
        editingEntry
          ? `Charge updated ($${computedAmount.toFixed(2)})`
          : `Charge of $${computedAmount.toFixed(2)} added to ${order.booked_by} for ${monthStr}`
      );
      onOpenChange(false);
    } catch (err: any) {
      console.error("Add salary charge failed", err);
      toast.error(err?.message || "Failed to add charge");
    } finally {
      setSaving(false);
    }
  };

  const handleEditExisting = (idx: number) => {
    const e = existingCharges[idx];
    if (!e) return;
    setEditingIdx(idx);
    setReason(e.reason || "");
    setCommAnnulment(e.source === "comm_annulment");
    setPercent(String(e.order_percent ?? 50));
  };

  const handleDeleteExisting = async (idx: number) => {
    const e = existingCharges[idx];
    if (!e || !salaryRowId) return;
    if (!confirm("Remove this charge?")) return;
    setSaving(true);
    try {
      const updated = allAdditionals.filter((a) => a !== e);
      const { error } = await supabase
        .from("dispatcher_salary_payments" as any)
        .update({ additionals: updated })
        .eq("id", salaryRowId);
      if (error) throw error;
      setAllAdditionals(updated);
      setExistingCharges(updated.filter((a) => a?.order_id === order?.id));
      resetForm();
      onChanged?.();
      toast.success("Charge removed");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove charge");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingIdx !== null ? "Edit Salary Charge" : "Add Salary Charge"}</DialogTitle>
          <DialogDescription>
            {editingIdx !== null
              ? "This load already has a salary charge. Update it below or remove it."
              : "Create a charge on the booker's monthly salary based on this load."}
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

            {editingIdx !== null && existingCharges[editingIdx] && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="text-xs font-medium text-destructive uppercase">Editing existing charge</div>
                <div className="mt-1 font-medium">
                  Current: ${Number(existingCharges[editingIdx].amount || 0).toFixed(2)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {existingCharges[editingIdx].source === "comm_annulment"
                      ? "Comm. Annulment"
                      : `${existingCharges[editingIdx].order_percent ?? 0}%`}
                  </span>
                </div>
                {existingCharges[editingIdx].reason && (
                  <div className="text-xs text-muted-foreground">{existingCharges[editingIdx].reason}</div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="charge-percent">Percentage (0–100)</Label>
              <Input
                id="charge-percent"
                type="number"
                min={0}
                max={100}
                step="1"
                value={commAnnulment ? "0" : percent}
                disabled={commAnnulment}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setPercent("");
                    return;
                  }
                  const n = parseFloat(raw);
                  if (isNaN(n)) return;
                  const clamped = Math.max(0, Math.min(100, n));
                  setPercent(String(clamped));
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const txt = e.clipboardData.getData("text").trim();
                  const n = parseFloat(txt);
                  if (isNaN(n)) return;
                  setPercent(String(Math.max(0, Math.min(100, n))));
                }}
                onKeyDown={(e) => {
                  if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") {
                    e.preventDefault();
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="comm-annulment"
                checked={commAnnulment}
                onCheckedChange={(v) => {
                  const checked = !!v;
                  setCommAnnulment(checked);
                  if (checked) setPercent("0");
                }}
              />
              <Label htmlFor="comm-annulment" className="cursor-pointer">
                Comm. Annulment
              </Label>
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
              <div className="text-muted-foreground text-xs">
                {commAnnulment
                  ? `Formula: (Freight − Driver Pay) × ${formatPct(cutPct)}%`
                  : `Formula: (Freight × ${formatPct(grossPct)}% + (Freight − Driver Pay) × ${formatPct(cutPct)}%) × Percentage`}
              </div>
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
            Close
          </Button>
          {editingIdx !== null && (
            <Button variant="destructive" onClick={() => handleDeleteExisting(editingIdx)} disabled={saving}>
              Remove Charge
            </Button>
          )}
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving…" : editingIdx !== null ? "Save Changes" : "Add Charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddOrderSalaryChargeDialog;