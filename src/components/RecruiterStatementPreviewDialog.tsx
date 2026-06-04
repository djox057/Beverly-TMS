import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Loader2, Plus, Trash2, Send, AlertCircle } from "lucide-react";
import { generatePayrollPdf, PayrollAdjustment } from "@/utils/payrollPdfGenerator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface RecruiterStatementData {
  userId: string;
  recruiterEmail?: string | null;
  recruiterName: string;
  month: string; // YYYY-MM
  baseSalary: number;
  workDaysInMonth: number;
  perDayRate: number;
  extraDayDates: string[]; // YYYY-MM-DD
  lostDayDates: string[]; // YYYY-MM-DD
  withCardDays: number;
  withoutCardDays: number;
  withCardRate: number;
  withoutCardRate: number;
  foodAllowance: number;
  total: number;
  adjustments?: PayrollAdjustment[];
  sickDayDates?: string[]; // YYYY-MM-DD dates marked as PTO (this month)
  totalSickDaysAvailable?: number; // Yearly PTO cap (e.g. 3)
  usedPtoDaysYearly?: number; // Total PTO used this year
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: RecruiterStatementData;
  onAdjustmentsChange?: (next: PayrollAdjustment[]) => void;
  onSent?: () => void;
  onPtoChanged?: (userId: string, ptoCount: number) => void;
}

const formatMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

const toMMDD = (d: string) => {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}`;
};

const buildPdf = async (
  data: RecruiterStatementData,
  adjustments: PayrollAdjustment[],
  previewOnly: boolean,
  overrides?: { sickDayDates?: string[]; usedPtoDaysYearly?: number },
) => {
  const extraRows: { label: string; amount: number }[] = [];
  if (data.withCardDays > 0) {
    extraRows.push({
      label: `With Card (${data.withCardDays} × $${data.withCardRate})`,
      amount: data.withCardDays * data.withCardRate,
    });
  }
  if (data.withoutCardDays > 0) {
    extraRows.push({
      label: `Without Card (${data.withoutCardDays} × $${data.withoutCardRate})`,
      amount: data.withoutCardDays * data.withoutCardRate,
    });
  }

  const sickDayDates = overrides?.sickDayDates ?? data.sickDayDates ?? [];
  const usedPtoDaysYearly = overrides?.usedPtoDaysYearly ?? data.usedPtoDaysYearly;

  return generatePayrollPdf(
    {
      employeeName: data.recruiterName,
      payPeriod: formatMonth(data.month),
      salary1Percent: data.baseSalary,
      bonus5Percent: 0,
      foodAllowance: data.foodAllowance,
      extraDays: data.extraDayDates.length,
      lostDays: data.lostDayDates.length,
      extraDayDates: data.extraDayDates.map(toMMDD),
      lostDayDates: data.lostDayDates.map(toMMDD),
      extraDaysAmount: data.extraDayDates.length * data.perDayRate,
      perDayRate: data.perDayRate,
      adjustments,
      departmentLabel: "Recruiting",
      salary1Label: "Base Salary",
      hideBonusRow: true,
      extraRows,
      extraDaysLabel: "Extra days",
      sickDayDates: sickDayDates.map(toMMDD),
      totalSickDaysAvailable: data.totalSickDaysAvailable,
      usedPtoDaysYearly,
    },
    { previewOnly },
  );
};

export default function RecruiterStatementPreviewDialog({
  open,
  onOpenChange,
  data,
  onAdjustmentsChange,
  onSent,
  onPtoChanged,
}: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>(data.adjustments ?? []);
  const [showAdjustmentsForm, setShowAdjustmentsForm] = useState(false);
  const [isCheckedState, setIsCheckedState] = useState(false);

  // PTO state — reuses dispatcher_sick_days table (keyed by user_id only)
  const MAX_PTO_DAYS = data.totalSickDaysAvailable ?? 3;
  const [ptoSelectedDates, setPtoSelectedDates] = useState<string[]>([]); // YYYY-MM-DD (this month)
  const [yearlyPtoUsed, setYearlyPtoUsed] = useState<number>(0);
  const ptoYear = (() => {
    const y = parseInt(data.month.split("-")[0], 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  })();

  // Extra Pay / Charges form
  const [newType, setNewType] = useState<"addition" | "charge">("addition");
  const [newReason, setNewReason] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [amountMode, setAmountMode] = useState<"dollar" | "percent">("dollar");

  // Penalty form
  const [penReason, setPenReason] = useState("");
  const [penAmount, setPenAmount] = useState("");
  const [penApplied, setPenApplied] = useState(true);
  const [penMode, setPenMode] = useState<"dollar" | "percent">("dollar");

  const percentBase =
    data.baseSalary +
    data.withCardDays * data.withCardRate +
    data.withoutCardDays * data.withoutCardRate;

  const resolveAdjustments = (list: PayrollAdjustment[]): PayrollAdjustment[] =>
    list.map((a) =>
      a.percent != null ? { ...a, amount: (percentBase * a.percent) / 100 } : a,
    );

  const computeAmount = (raw: string, mode: "dollar" | "percent") => {
    const n = parseFloat(raw);
    if (isNaN(n)) return NaN;
    return mode === "percent" ? (percentBase * n) / 100 : n;
  };

  // Sync local adjustments when dialog opens (so we get fresh server state)
  useEffect(() => {
    if (open) {
      setAdjustments(data.adjustments ?? []);
      setShowAdjustmentsForm(false);
      setNewReason("");
      setNewAmount("");
      setPenReason("");
      setPenAmount("");
      setPenApplied(true);
    }
  }, [open, data.adjustments]);

  // Load PTO state when dialog opens
  useEffect(() => {
    if (!open || !data.userId || !data.month) return;
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .from("dispatcher_sick_days" as any)
        .select("sick_date")
        .eq("user_id", data.userId)
        .eq("year", ptoYear);
      if (cancelled) return;
      if (error) {
        console.error("Error loading PTO:", error);
        return;
      }
      const all = (rows ?? []).map((r: any) => r.sick_date as string);
      setYearlyPtoUsed(all.length);
      setPtoSelectedDates(all.filter((d) => d.substring(0, 7) === data.month));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, data.userId, data.month, ptoYear]);

  // Load is_checked from server
  useEffect(() => {
    if (!open || !data.userId || !data.month) return;
    (async () => {
      const { data: row } = await supabase
        .from("recruiter_salary_payments" as any)
        .select("is_checked")
        .eq("user_id", data.userId)
        .eq("month", data.month)
        .maybeSingle();
      setIsCheckedState(((row as any)?.is_checked as boolean) || false);
    })();
  }, [open, data.userId, data.month]);

  // Build / rebuild preview
  useEffect(() => {
    if (!open) return;
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const blob = await buildPdf(data, resolveAdjustments(adjustments), true, {
          sickDayDates: ptoSelectedDates,
          usedPtoDaysYearly: yearlyPtoUsed,
        });
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoke = url;
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (err: any) {
        toast.error("Failed to generate preview: " + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data, adjustments, ptoSelectedDates, yearlyPtoUsed]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistAdjustments = async (next: PayrollAdjustment[]) => {
    setAdjustments(next);
    onAdjustmentsChange?.(next);
    const { error } = await supabase
      .from("recruiter_salary_payments" as any)
      .update({ adjustments: next.length > 0 ? next : null })
      .eq("user_id", data.userId)
      .eq("month", data.month);
    if (error) toast.error("Failed to save adjustments: " + error.message);
  };

  const handleAddAdjustment = () => {
    if (!newReason.trim()) return toast.error("Enter a reason");
    const amount = computeAmount(newAmount, amountMode);
    if (isNaN(amount) || amount <= 0) return toast.error("Invalid amount");
    const item: PayrollAdjustment = {
      type: newType,
      reason: newReason.trim(),
      amount,
      ...(amountMode === "percent" ? { percent: parseFloat(newAmount) } : {}),
    };
    persistAdjustments([...adjustments, item]);
    setNewReason("");
    setNewAmount("");
  };

  const handleAddPenalty = () => {
    if (!penReason.trim()) return toast.error("Enter a reason");
    const raw = penAmount.trim();
    const amount = raw === "" ? 0 : computeAmount(penAmount, penMode);
    if (isNaN(amount) || amount < 0) return toast.error("Invalid amount");
    const item: PayrollAdjustment = {
      type: "penalty",
      reason: penReason.trim(),
      amount,
      applied: penApplied,
      ...(raw !== "" && penMode === "percent" ? { percent: parseFloat(penAmount) } : {}),
    };
    persistAdjustments([...adjustments, item]);
    setPenReason("");
    setPenAmount("");
    setPenApplied(true);
  };

  const handleRemove = (idx: number) =>
    persistAdjustments(adjustments.filter((_, i) => i !== idx));

  const handleTogglePenalty = (idx: number, applied: boolean) =>
    persistAdjustments(
      adjustments.map((a, i) =>
        i === idx && a.type === "penalty" ? { ...a, applied } : a,
      ),
    );

  const handlePtoToggle = async (date: string, checked: boolean) => {
    const isCurrentlySelected = ptoSelectedDates.includes(date);
    if (checked === isCurrentlySelected) return;
    if (checked && yearlyPtoUsed >= MAX_PTO_DAYS) {
      toast.error(`Maximum ${MAX_PTO_DAYS} PTO days per year`);
      return;
    }
    const nextSelected = checked
      ? [...ptoSelectedDates, date].sort()
      : ptoSelectedDates.filter((d) => d !== date);
    const nextYearly = checked ? yearlyPtoUsed + 1 : Math.max(0, yearlyPtoUsed - 1);
    setPtoSelectedDates(nextSelected);
    setYearlyPtoUsed(nextYearly);
    try {
      if (checked) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("dispatcher_sick_days" as any).insert({
          user_id: data.userId,
          sick_date: date,
          year: ptoYear,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dispatcher_sick_days" as any)
          .delete()
          .eq("user_id", data.userId)
          .eq("sick_date", date);
        if (error) throw error;
      }
      onPtoChanged?.(data.userId, nextSelected.length);
    } catch (err: any) {
      setPtoSelectedDates(ptoSelectedDates);
      setYearlyPtoUsed(yearlyPtoUsed);
      toast.error("Failed to save PTO: " + (err?.message || "unknown"));
    }
  };

  const handleToggleChecked = async () => {
    const next = !isCheckedState;
    setIsCheckedState(next);
    const { error } = await supabase
      .from("recruiter_salary_payments" as any)
      .update({ is_checked: next })
      .eq("user_id", data.userId)
      .eq("month", data.month);
    if (error) {
      toast.error("Failed to update checked: " + error.message);
      setIsCheckedState(!next);
    }
  };

  const computeTotal = () => {
    const resolved = resolveAdjustments(adjustments);
    const adjTotal = resolved.reduce((s, a) => {
      if (a.type === "addition") return s + a.amount;
      if (a.type === "charge") return s - a.amount;
      if (a.type === "penalty" && a.applied) return s - a.amount;
      return s;
    }, 0);
    const ptoCount = ptoSelectedDates.length;
    const nonPtoLostDays = Math.max(0, data.lostDayDates.length - ptoCount);
    return (
      data.baseSalary +
      data.extraDayDates.length * data.perDayRate -
      nonPtoLostDays * data.perDayRate +
      data.withCardDays * data.withCardRate +
      data.withoutCardDays * data.withoutCardRate +
      adjTotal
    );
  };

  const handleDownload = async () => {
    try {
      const blob = await buildPdf(data, resolveAdjustments(adjustments), false, {
        sickDayDates: ptoSelectedDates,
        usedPtoDaysYearly: yearlyPtoUsed,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = data.recruiterName.replace(/\s+/g, "_");
      a.download = `Recruiter_Statement_${safeName}_${data.month}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error("Failed to generate PDF: " + err.message);
    }
  };

  const handleSend = async () => {
    if (!data.recruiterEmail) {
      toast.error("Recruiter has no email on file");
      return;
    }
    setSending(true);
    try {
      const pdfBlob = await buildPdf(data, resolveAdjustments(adjustments), false, {
        sickDayDates: ptoSelectedDates,
        usedPtoDaysYearly: yearlyPtoUsed,
      });
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfBytes = Array.from(new Uint8Array(arrayBuffer));
      const { error: emailErr } = await supabase.functions.invoke("send-payroll-email", {
        body: {
          recipientEmail: data.recruiterEmail,
          dispatcherName: data.recruiterName,
          payPeriod: formatMonth(data.month),
          pdfBytes,
        },
      });
      if (emailErr) throw emailErr;

      const total = computeTotal();
      const { data: { user } } = await supabase.auth.getUser();
      const { error: updateErr } = await supabase
        .from("recruiter_salary_payments" as any)
        .update({
          paid: true,
          paid_amount: total,
          calculated_salary: data.baseSalary,
          paid_at: new Date().toISOString(),
          adjustments: adjustments.length > 0 ? adjustments : null,
        })
        .eq("user_id", data.userId)
        .eq("month", data.month);
      if (updateErr) throw updateErr;

      toast.success(`Statement sent to ${data.recruiterEmail}`);
      onSent?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to send: " + (err.message ?? "unknown error"));
    } finally {
      setSending(false);
    }
  };

  const resolved = resolveAdjustments(adjustments);
  const chargesAndExtras = resolved
    .map((adj, index) => ({ adj, index }))
    .filter((x) => x.adj.type === "addition" || x.adj.type === "charge");
  const penalties = resolved
    .map((adj, index) => ({ adj, index }))
    .filter((x) => x.adj.type === "penalty");

  const hasLostDays = data.lostDayDates.length > 0;
  const showRightPanel = showAdjustmentsForm || adjustments.length > 0 || hasLostDays;
  const remainingPtoDays = Math.max(0, MAX_PTO_DAYS - yearlyPtoUsed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Payroll Statement Preview - {data.recruiterName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex gap-2">
          <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-gray-100">
            {loading && !pdfUrl ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-[700px]"
                title="Recruiter statement preview"
                style={{ border: "none" }}
              />
            ) : null}
          </div>

          {!showAdjustmentsForm && adjustments.length === 0 && (
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 self-start"
              onClick={() => setShowAdjustmentsForm(true)}
              title="Add Extra Pay / Charge / Penalty"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}

          {showRightPanel && (
            <div className="w-72 border rounded-lg p-4 space-y-4 overflow-y-auto max-h-[700px]">
              {hasLostDays && (
                <>
                  <div>
                    <h3 className="font-semibold text-sm">Mark as PTO</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      PTO days don't reduce salary. {remainingPtoDays} of {MAX_PTO_DAYS} remaining this year.
                    </p>
                  </div>

                  {remainingPtoDays <= 0 && ptoSelectedDates.length === 0 && (
                    <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <p className="text-xs text-yellow-700 dark:text-yellow-400">
                        No PTO days remaining for this year.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Days off:</p>
                    {data.lostDayDates.map((date) => {
                      const isPto = ptoSelectedDates.includes(date);
                      return (
                        <div key={date} className="flex items-center gap-2">
                          <Checkbox
                            id={`recruiter-pto-${date}`}
                            checked={isPto}
                            onCheckedChange={(c) => handlePtoToggle(date, c as boolean)}
                            disabled={!isPto && remainingPtoDays <= 0}
                          />
                          <Label
                            htmlFor={`recruiter-pto-${date}`}
                            className="text-sm cursor-pointer"
                          >
                            {toMMDD(date)} {isPto && <span className="text-green-600">(PTO)</span>}
                          </Label>
                        </div>
                      );
                    })}
                  </div>

                  {!showAdjustmentsForm && adjustments.length === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowAdjustmentsForm(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Extra Pay / Charge / Penalty
                    </Button>
                  )}

                  {(showAdjustmentsForm || adjustments.length > 0) && <div className="border-t" />}
                </>
              )}

              {(showAdjustmentsForm || adjustments.length > 0) && (
              <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Extra Pay / Charges</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add additional payments or deductions.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setShowAdjustmentsForm(false)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {chargesAndExtras.length > 0 && (
                <div className="space-y-2">
                  {chargesAndExtras.map(({ adj, index }) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-2 rounded-md text-sm ${
                        adj.type === "addition"
                          ? "bg-green-50 dark:bg-green-900/20"
                          : "bg-red-50 dark:bg-red-900/20"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{adj.reason}</p>
                        <p className={adj.type === "addition" ? "text-green-600" : "text-red-600"}>
                          {adj.type === "addition" ? "+" : "-"}${adj.amount.toFixed(2)}
                          {adj.percent != null && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({adj.percent}% of base)
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => handleRemove(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <Button
                    variant={newType === "addition" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setNewType("addition")}
                  >
                    Extra Pay
                  </Button>
                  <Button
                    variant={newType === "charge" ? "destructive" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setNewType("charge")}
                  >
                    Charge
                  </Button>
                </div>

                <Input
                  placeholder="Reason"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="h-8 text-sm"
                />

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        setAmountMode((m) => (m === "dollar" ? "percent" : "dollar"))
                      }
                      className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={
                        amountMode === "dollar"
                          ? "Click to switch to % of base"
                          : `Click to switch to $. Base: $${percentBase.toFixed(2)}`
                      }
                      tabIndex={-1}
                    >
                      {amountMode === "dollar" ? "$" : "%"}
                    </button>
                    <Input
                      type="number"
                      placeholder={amountMode === "dollar" ? "Amount" : "Percent"}
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="h-8 text-sm pl-8"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddAdjustment}
                    disabled={!newReason.trim() || !newAmount}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Penalties */}
              <div className="border-t pt-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">Penalties</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Check the box to apply the deduction. Otherwise it will only show as a warning.
                  </p>
                </div>

                {penalties.length > 0 && (
                  <div className="space-y-2">
                    {penalties.map(({ adj, index }) => (
                      <div
                        key={index}
                        className={`flex items-start gap-2 p-2 rounded-md text-sm ${
                          adj.applied
                            ? "bg-red-50 dark:bg-red-900/20"
                            : "bg-yellow-50 dark:bg-yellow-900/20"
                        }`}
                      >
                        <Checkbox
                          checked={!!adj.applied}
                          onCheckedChange={(c) => handleTogglePenalty(index, c as boolean)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{adj.reason}</p>
                          {adj.applied ? (
                            <p className="text-red-600">
                              -${adj.amount.toFixed(2)}
                              {adj.percent != null && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({adj.percent}% of base)
                                </span>
                              )}
                            </p>
                          ) : (
                            <p className="text-yellow-700 dark:text-yellow-500 text-xs">
                              Warning only — would be ${adj.amount.toFixed(2)}
                              {adj.percent != null && ` (${adj.percent}% of base)`}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => handleRemove(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <Input
                    placeholder="Reason"
                    value={penReason}
                    onChange={(e) => setPenReason(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPenMode((m) => (m === "dollar" ? "percent" : "dollar"))
                        }
                        className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title={
                          penMode === "dollar"
                            ? "Click to switch to % of base"
                            : `Click to switch to $. Base: $${percentBase.toFixed(2)}`
                        }
                        tabIndex={-1}
                      >
                        {penMode === "dollar" ? "$" : "%"}
                      </button>
                      <Input
                        type="number"
                        placeholder={penMode === "dollar" ? "Amount" : "Percent"}
                        value={penAmount}
                        onChange={(e) => setPenAmount(e.target.value)}
                        className="h-8 text-sm pl-8"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleAddPenalty}
                      disabled={!penReason.trim() || !penAmount}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={penApplied}
                      onCheckedChange={(c) => setPenApplied(c as boolean)}
                    />
                    <span>Apply as deduction (uncheck for warning only)</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <label
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer border transition-colors ${
                  isCheckedState
                    ? "bg-green-100 dark:bg-green-950/30 border-green-300 dark:border-green-800"
                    : "border-input"
                }`}
              >
                <Checkbox checked={isCheckedState} onCheckedChange={handleToggleChecked} />
                <span className="text-sm font-medium">Checked</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send & Mark as Paid
                  </>
                )}
              </Button>
            </div>
          </div>
          {data.recruiterEmail && (
            <div className="flex justify-end w-full">
              <span className="text-xs text-muted-foreground">{data.recruiterEmail}</span>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}