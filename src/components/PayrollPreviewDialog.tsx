import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Send, Loader2, AlertCircle, Plus, Trash2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePayrollPdf, PayrollAdjustment } from "@/utils/payrollPdfGenerator";

interface PayrollPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatcherName: string;
  dispatcherUserId: string;
  recipientEmail: string;
  payPeriod: string;
  selectedMonth: string; // Format: YYYY-MM
  salary1Percent: number;
  bonus5Percent: number;
  salary1Label?: string;
  bonus5Label?: string;
  foodAllowance: number;
  extraDays: number;
  lostDays: number;
  extraDayDates: string[];
  lostDayDates: string[];
  extraDaysAmount: number;
  dispatcherBonus?: number;
  recoveryBonus?: number;
  perDayRate?: number;
  onEmailSent: () => void;
  onAdjustmentsChanged?: () => void; // Called when adjustments are saved to DB
  onCheckedChanged?: () => void; // Called when checked status changes
  onPtoChanged?: (userId: string, ptoCount: number) => void; // Called when PTO selections change
  previewOnly?: boolean; // When true, hide send button and PTO editing
  // When true, hide Extra Pay / Charges (but still show Penalties).
  // Used for the dispatch role.
  hideChargesAndExtraPay?: boolean;
  isDeletedUser?: boolean; // When true, add future month salary/bonus rows
  futureSalary1Percent?: number; // Salary 1% for next month
  futureBonus5Percent?: number; // Bonus 5% for next month
  futureMonthLabel?: string; // e.g., "February"
  office?: string; // Dispatcher's office for conditional logic
}

export const PayrollPreviewDialog: React.FC<PayrollPreviewDialogProps> = ({
  open,
  onOpenChange,
  dispatcherName,
  dispatcherUserId,
  recipientEmail,
  payPeriod,
  selectedMonth,
  salary1Percent,
  bonus5Percent,
  salary1Label,
  bonus5Label,
  foodAllowance,
  extraDays,
  lostDays,
  extraDayDates,
  lostDayDates,
  extraDaysAmount,
  dispatcherBonus = 0,
  recoveryBonus = 0,
  perDayRate = 0,
  onEmailSent,
  onAdjustmentsChanged,
  onCheckedChanged,
  onPtoChanged,
  previewOnly = false,
  hideChargesAndExtraPay = false,
  isDeletedUser = false,
  futureSalary1Percent = 0,
  futureBonus5Percent = 0,
  futureMonthLabel = "",
  office,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [ptoSelections, setPtoSelections] = useState<Record<string, boolean>>({});
  const [usedPtoDaysThisYear, setUsedPtoDaysThisYear] = useState(0);
  const [existingPtoDays, setExistingPtoDays] = useState<string[]>([]);
  
  // Custom adjustments (extra pay and charges)
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [showAdjustmentsForm, setShowAdjustmentsForm] = useState(false);
  const [newAdjustmentType, setNewAdjustmentType] = useState<"addition" | "charge">("addition");
  const [newAdjustmentReason, setNewAdjustmentReason] = useState("");
  const [newAdjustmentAmount, setNewAdjustmentAmount] = useState("");

  // Penalty form state
  const [newPenaltyReason, setNewPenaltyReason] = useState("");
  const [newPenaltyAmount, setNewPenaltyAmount] = useState("");
  const [newPenaltyApplied, setNewPenaltyApplied] = useState(true);

  // Input mode for amount fields ($ vs % of base)
  // Base = salary1Percent (gross*0.01) + bonus5Percent (comm*0.05)
  // Excludes additionals, food allowance, extra/lost days, dispatcher bonus.
  const [adjustmentAmountMode, setAdjustmentAmountMode] = useState<"dollar" | "percent">("dollar");
  const [penaltyAmountMode, setPenaltyAmountMode] = useState<"dollar" | "percent">("dollar");
  const percentBase = salary1Percent + bonus5Percent + recoveryBonus;
  const computeAmountFromInput = (raw: string, mode: "dollar" | "percent"): number => {
    const n = parseFloat(raw);
    if (isNaN(n)) return NaN;
    return mode === "percent" ? (percentBase * n) / 100 : n;
  };

  // For any adjustment that was entered as a percentage, recompute its dollar
  // amount from the CURRENT percentBase so totals/PDF stay in sync as salary
  // changes. Adjustments without `percent` are returned unchanged.
  const resolveAdjustments = (list: PayrollAdjustment[]): PayrollAdjustment[] =>
    list.map((a) =>
      a.percent != null
        ? { ...a, amount: (percentBase * a.percent) / 100 }
        : a,
    );
  
  // Checked state
  const [isCheckedState, setIsCheckedState] = useState(false);

  // Load checked state when dialog opens
  useEffect(() => {
    if (open && dispatcherUserId && selectedMonth) {
      loadCheckedState();
    }
  }, [open, dispatcherUserId, selectedMonth]);

  const loadCheckedState = async () => {
    try {
      const { data } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("is_checked")
        .eq("month", selectedMonth)
        .eq("user_id", dispatcherUserId)
        .maybeSingle();
      setIsCheckedState((data as any)?.is_checked || false);
    } catch (err) {
      console.error("Error loading checked state:", err);
    }
  };

  const handleToggleChecked = async () => {
    const newChecked = !isCheckedState;
    setIsCheckedState(newChecked);
    try {
      const { data: existing } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("id")
        .eq("month", selectedMonth)
        .eq("user_id", dispatcherUserId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("dispatcher_salary_payments" as any)
          .update({ is_checked: newChecked })
          .eq("user_id", dispatcherUserId)
          .eq("month", selectedMonth);
      } else {
        await supabase
          .from("dispatcher_salary_payments" as any)
          .insert({
            user_id: dispatcherUserId,
            month: selectedMonth,
            is_checked: newChecked,
            paid_amount: 0,
          });
      }
      onCheckedChanged?.();
    } catch (err) {
      console.error("Error toggling checked:", err);
      setIsCheckedState(!newChecked); // revert
    }
  };

  // Persist adjustments to DB immediately
  const saveAdjustmentsToDb = async (newAdjustments: PayrollAdjustment[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Upsert: check if a record exists for this month/user
      const { data: existing } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("id")
        .eq("month", selectedMonth)
        .eq("user_id", dispatcherUserId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("dispatcher_salary_payments" as any)
          .update({ additionals: newAdjustments.length > 0 ? newAdjustments : null })
          .eq("id", (existing as any).id);
      } else {
        // Create a record with just additionals (not yet paid)
        const baseRate = salary1Percent + bonus5Percent + recoveryBonus;
        const selectedPtoDates = Object.entries(ptoSelections).filter(([_, v]) => v).map(([d]) => d);
        const nonSickLostDays = Math.max(0, lostDays - selectedPtoDates.length);
        const daysOffDeduction = nonSickLostDays * perDayRate;
        const resolvedNew = resolveAdjustments(newAdjustments);
        const adjTotal = resolvedNew.reduce((sum: number, a: any) => {
          if (a.type === "addition") return sum + a.amount;
          if (a.type === "charge") return sum - a.amount;
          if (a.type === "penalty" && a.applied) return sum - a.amount;
          return sum;
        }, 0);
        const fullTotal = baseRate + foodAllowance + extraDaysAmount - daysOffDeduction + dispatcherBonus + adjTotal;
        await supabase
          .from("dispatcher_salary_payments" as any)
          .insert({
            user_id: dispatcherUserId,
            month: selectedMonth,
            paid_amount: fullTotal,
            calculated_salary: baseRate,
            additionals: newAdjustments.length > 0 ? newAdjustments : null,
          });
      }
      onAdjustmentsChanged?.();
    } catch (err) {
      console.error("Error saving adjustments:", err);
    }
  };

  const year = parseInt(selectedMonth.split("-")[0], 10);
  const maxPtoDays = 3;

  // Load existing PTO days and adjustments when dialog opens
  useEffect(() => {
    if (open && dispatcherUserId) {
      // Reset state immediately to prevent stale data from previous user
      setAdjustments([]);
      setShowAdjustmentsForm(false);
      setNewAdjustmentReason("");
      setNewAdjustmentAmount("");
      setPdfUrl(null);
      loadPtoDays();
      loadExistingAdjustments();
    }
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [open, dispatcherUserId]);

  const loadExistingAdjustments = async () => {
    try {
      if (hideChargesAndExtraPay) {
        const { data, error } = await supabase.rpc("get_dispatcher_salary_penalties" as any, {
          _user_id: dispatcherUserId,
          _month: selectedMonth,
        });

        if (error) throw error;

        const loaded = Array.isArray(data) ? (data as PayrollAdjustment[]) : [];
        setAdjustments(loaded);
        if (loaded.length > 0) setShowAdjustmentsForm(true);
        return;
      }

      const { data } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("additionals")
        .eq("month", selectedMonth)
        .eq("user_id", dispatcherUserId)
        .maybeSingle();

      if (data && (data as any).additionals) {
        const loaded = (data as any).additionals as PayrollAdjustment[];
        setAdjustments(loaded);
        if (loaded.length > 0) setShowAdjustmentsForm(true);
      } else {
        setAdjustments([]);
      }
    } catch (err) {
      console.error("Error loading adjustments:", err);
      setAdjustments([]);
    }
  };

  // Generate initial preview after component mounts
  useEffect(() => {
    if (open && !loading) {
      generatePreview();
    }
  }, [open]);

  const loadPtoDays = async () => {
    try {
      const { data, error } = await supabase
        .from("dispatcher_sick_days" as any)
        .select("sick_date")
        .eq("user_id", dispatcherUserId)
        .eq("year", year);

      if (error) throw error;

      const ptoDates = (data || []).map((d: any) => d.sick_date);
      setExistingPtoDays(ptoDates);
      setUsedPtoDaysThisYear(ptoDates.length);

      // Initialize selections - pre-check dates that are already marked as PTO
      const monthPrefix = selectedMonth; // YYYY-MM
      const initialSelections: Record<string, boolean> = {};
      lostDayDates.forEach(date => {
        // Convert MM/DD format to full date for comparison
        const [month, day] = date.split("/");
        const fullDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        initialSelections[date] = ptoDates.includes(fullDate);
      });
      setPtoSelections(initialSelections);
    } catch (err) {
      console.error("Error loading PTO days:", err);
    }
  };

  const generatePreview = async () => {
    setLoading(true);
    try {
      // Get selected PTO dates (MM/DD format)
      const selectedPtoDates = Object.entries(ptoSelections)
        .filter(([_, isChecked]) => isChecked)
        .map(([date]) => date);

      const pdfBlob = await generatePayrollPdf({
        employeeName: dispatcherName,
        payPeriod,
        salary1Percent,
        bonus5Percent,
        salary1Label,
        bonus5Label,
        recoveryBonus,
        foodAllowance,
        extraDays,
        lostDays,
        extraDayDates,
        lostDayDates,
        extraDaysAmount,
        dispatcherBonus,
        perDayRate,
        sickDayDates: selectedPtoDates,
        totalSickDaysAvailable: maxPtoDays,
        adjustments: hideChargesAndExtraPay
          ? resolveAdjustments(adjustments).filter((a) => a.type === "penalty")
          : resolveAdjustments(adjustments),
        usedPtoDaysYearly: usedPtoDaysThisYear,
        isDeletedUser,
        futureMonthLabel,
        futureSalary1Percent,
        futureBonus5Percent,
        office,
      }, { previewOnly: true });

      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
    } catch (err) {
      console.error("Error generating preview:", err);
      toast.error("Failed to generate preview");
    } finally {
      setLoading(false);
    }
  };

  // Regenerate preview when PTO selections or adjustments change
  useEffect(() => {
    if (open && !loading) {
      generatePreview();
    }
  }, [ptoSelections, adjustments]);

  const handleAddAdjustment = () => {
    const amount = computeAmountFromInput(newAdjustmentAmount, adjustmentAmountMode);
    if (!newAdjustmentReason.trim()) {
      toast.error("Please enter a reason");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const newAdj: PayrollAdjustment = {
      type: newAdjustmentType,
      reason: newAdjustmentReason.trim(),
      amount,
      ...(adjustmentAmountMode === "percent"
        ? { percent: parseFloat(newAdjustmentAmount) }
        : {}),
    };
    const updated = [...adjustments, newAdj];
    setAdjustments(updated);
    saveAdjustmentsToDb(updated);

    // Reset form
    setNewAdjustmentReason("");
    setNewAdjustmentAmount("");
  };

  const handleRemoveAdjustment = (index: number) => {
    const updated = adjustments.filter((_, i) => i !== index);
    setAdjustments(updated);
    saveAdjustmentsToDb(updated);
  };

  const handleAddPenalty = () => {
    if (!newPenaltyReason.trim()) {
      toast.error("Please enter a reason");
      return;
    }
    const rawAmount = newPenaltyAmount.trim();
    const amount = rawAmount === ""
      ? 0
      : computeAmountFromInput(newPenaltyAmount, penaltyAmountMode);
    if (isNaN(amount) || amount < 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    const newPen: PayrollAdjustment = {
      type: "penalty",
      reason: newPenaltyReason.trim(),
      amount,
      applied: newPenaltyApplied,
      ...(rawAmount !== "" && penaltyAmountMode === "percent"
        ? { percent: parseFloat(newPenaltyAmount) }
        : {}),
    };
    const updated = [...adjustments, newPen];
    setAdjustments(updated);
    saveAdjustmentsToDb(updated);
    setNewPenaltyReason("");
    setNewPenaltyAmount("");
    setNewPenaltyApplied(true);
  };

  const handleTogglePenaltyApplied = (index: number, applied: boolean) => {
    const updated = adjustments.map((a, i) =>
      i === index && a.type === "penalty" ? { ...a, applied } : a,
    );
    setAdjustments(updated);
    saveAdjustmentsToDb(updated);
  };

  // Use a ref to serialize PTO saves and prevent race conditions
  const ptoSaveQueue = React.useRef<Promise<void>>(Promise.resolve());

  const savePtoToDb = (selections: Record<string, boolean>) => {
    // Chain saves to prevent race conditions when toggling multiple days quickly
    ptoSaveQueue.current = ptoSaveQueue.current.then(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const selectedPtoDays = Object.entries(selections)
          .filter(([_, isChecked]) => isChecked)
          .map(([date]) => {
            const [month, day] = date.split("/");
            return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
          });

        // Remove existing PTO days for this month
        const monthStart = `${selectedMonth}-01`;
        const monthNum = parseInt(selectedMonth.split("-")[1], 10);
        const lastDayOfMonth = !isNaN(monthNum) ? new Date(year, monthNum, 0).getDate() : 31;
        const monthEnd = `${selectedMonth}-${String(lastDayOfMonth).padStart(2, "0")}`;
        await supabase
          .from("dispatcher_sick_days" as any)
          .delete()
          .eq("user_id", dispatcherUserId)
          .gte("sick_date", monthStart)
          .lte("sick_date", monthEnd);

        // Insert new PTO days
        if (selectedPtoDays.length > 0) {
          await supabase
            .from("dispatcher_sick_days" as any)
            .insert(
              selectedPtoDays.map(date => ({
                user_id: dispatcherUserId,
                sick_date: date,
                year,
                created_by: user.id,
              }))
            );
        }

        // Update existingPtoDays to reflect saved state
        const otherMonthDays = existingPtoDays.filter(d => d.substring(0, 7) !== selectedMonth);
        setExistingPtoDays([...otherMonthDays, ...selectedPtoDays]);
        setUsedPtoDaysThisYear(otherMonthDays.length + selectedPtoDays.length);
      } catch (err) {
        console.error("Error saving PTO:", err);
        toast.error("Failed to save PTO");
      }
    });
  };

  const handlePtoToggle = (date: string, checked: boolean) => {
    const currentSelectedCount = Object.values(ptoSelections).filter(Boolean).length;
    const alreadyUsedBeforeThisMonth = existingPtoDays.filter(d => {
      const dateMonth = d.substring(0, 7); // YYYY-MM
      return dateMonth !== selectedMonth;
    }).length;

    const totalIfChecked = alreadyUsedBeforeThisMonth + currentSelectedCount + (checked ? 1 : -1);

    if (checked && totalIfChecked > maxPtoDays) {
      toast.error(`Maximum ${maxPtoDays} PTO days per year. You have ${alreadyUsedBeforeThisMonth} already used.`);
      return;
    }

    const updated = { ...ptoSelections, [date]: checked };
    setPtoSelections(updated);
    savePtoToDb(updated);
    // Notify parent of PTO count change for instant salary update
    const newPtoCount = Object.values(updated).filter(Boolean).length;
    onPtoChanged?.(dispatcherUserId, newPtoCount);
  };

  const handleSendEmail = async () => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      // PTO selections are already saved to DB on toggle - just get them for PDF
      const ptoDatesForEmail = Object.entries(ptoSelections)
        .filter(([_, isChecked]) => isChecked)
        .map(([date]) => date);

      // Generate the final PDF with PTO data and adjustments
      const pdfBlob = await generatePayrollPdf({
        employeeName: dispatcherName,
        payPeriod,
        salary1Percent,
        bonus5Percent,
        salary1Label,
        bonus5Label,
        recoveryBonus,
        foodAllowance,
        extraDays,
        lostDays,
        extraDayDates,
        lostDayDates,
        extraDaysAmount,
        dispatcherBonus,
        perDayRate,
        sickDayDates: ptoDatesForEmail,
        totalSickDaysAvailable: maxPtoDays,
        adjustments: resolveAdjustments(adjustments),
        usedPtoDaysYearly: usedPtoDaysThisYear,
        isDeletedUser,
        futureMonthLabel,
        futureSalary1Percent,
        futureBonus5Percent,
        office,
      }, { previewOnly: false });

      // Convert to bytes
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfBytes = Array.from(new Uint8Array(arrayBuffer));

      // Send email
      const { error } = await supabase.functions.invoke("send-payroll-email", {
        body: {
          recipientEmail,
          dispatcherName,
          payPeriod,
          pdfBytes,
        },
      });

      if (error) throw error;

      // Mark as paid
      const now = new Date().toISOString();
      
      // Delete previous record for this month
      await supabase
        .from("dispatcher_salary_payments" as any)
        .delete()
        .eq("month", selectedMonth)
        .eq("user_id", dispatcherUserId);

      // Calculate the full total for paid_amount (salary + all components)
      const baseRate = salary1Percent + bonus5Percent + recoveryBonus;
      const ptoCount = Object.values(ptoSelections).filter(Boolean).length;
      const nonSickLostDays = Math.max(0, lostDays - ptoCount);
      const daysOffDeduction = nonSickLostDays * perDayRate;
      const adjTotal = resolveAdjustments(adjustments).reduce((sum: number, a: any) => {
        if (a.type === "addition") return sum + a.amount;
        if (a.type === "charge") return sum - a.amount;
        if (a.type === "penalty" && a.applied) return sum - a.amount;
        return sum;
      }, 0);
      const fullPaidAmount = baseRate + foodAllowance + extraDaysAmount - daysOffDeduction + dispatcherBonus + adjTotal;

      // Insert new payment record: paid_amount = full total, calculated_salary = base rate only (for carry-over)
      await supabase
        .from("dispatcher_salary_payments" as any)
        .insert({
          user_id: dispatcherUserId,
          month: selectedMonth,
          paid_amount: fullPaidAmount,
          calculated_salary: baseRate,
          paid_at: now,
          paid_by: user.id,
          additionals: adjustments.length > 0 ? adjustments : null,
        });

      toast.success(`Payroll email sent for ${dispatcherName} (test: jon@bfprime.net)`);
      onEmailSent();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error sending email:", err);
      toast.error(`Failed to send email: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const remainingPtoDays = maxPtoDays - usedPtoDaysThisYear;
  const currentMonthPtoSelected = Object.values(ptoSelections).filter(Boolean).length;

  // Split adjustments by category for the right panel
  const resolvedAdjustments = resolveAdjustments(adjustments);
  const chargesAndExtras = resolvedAdjustments
    .map((a, i) => ({ adj: a, index: i }))
    .filter((x) => x.adj.type === "addition" || x.adj.type === "charge");
  const penalties = resolvedAdjustments
    .map((a, i) => ({ adj: a, index: i }))
    .filter((x) => x.adj.type === "penalty");

  // Right panel is visible when there's something to show or edit.
  // Dispatchers (previewOnly + hideChargesAndExtraPay) only see it when penalties exist.
  const canEditCharges = !previewOnly && !hideChargesAndExtraPay;
  const canEditPenalties = !previewOnly;
  const showRightPanel = previewOnly
    ? penalties.length > 0
    : (showAdjustmentsForm || lostDayDates.length > 0 || penalties.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {previewOnly ? "Payroll Statement" : "Payroll Statement Preview"} - {dispatcherName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex gap-2">
          {/* PDF Preview */}
          <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-gray-100">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-[700px]"
                title="Payroll Preview"
                style={{ border: 'none' }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No preview available
              </div>
            )}
          </div>
          
          {/* Add Adjustment Button - positioned to the right of preview */}
          {!previewOnly && !showAdjustmentsForm && lostDayDates.length === 0 && adjustments.length === 0 && (
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 self-start"
              onClick={() => setShowAdjustmentsForm(true)}
              title="Add Extra Pay / Charge / Penalty"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}

          {/* Right Panel - PTO, Adjustments and Penalties */}
          {showRightPanel && (
            <div className="w-72 border rounded-lg p-4 space-y-4 overflow-y-auto max-h-[700px]">
              {/* PTO Section - only show if there are days off */}
              {!previewOnly && lostDayDates.length > 0 && (
                <>
                  <div>
                    <h3 className="font-semibold text-sm">Mark as PTO</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      PTO days don't reduce salary. {remainingPtoDays} of {maxPtoDays} remaining this year.
                    </p>
                  </div>

                  {remainingPtoDays <= 0 && currentMonthPtoSelected === 0 && (
                    <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <p className="text-xs text-yellow-700 dark:text-yellow-400">
                        No PTO days remaining for this year.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Days off:</p>
                    {lostDayDates.map(date => (
                      <div key={date} className="flex items-center gap-2">
                        <Checkbox
                          id={`pto-${date}`}
                          checked={ptoSelections[date] || false}
                          onCheckedChange={(checked) => handlePtoToggle(date, checked as boolean)}
                          disabled={!ptoSelections[date] && remainingPtoDays <= 0}
                        />
                        <Label htmlFor={`pto-${date}`} className="text-sm cursor-pointer">
                          {date} {ptoSelections[date] && <span className="text-green-600">(PTO)</span>}
                        </Label>
                      </div>
                    ))}
                  </div>
                  
                  {showAdjustmentsForm ? (
                    <div className="border-t pt-4" />
                  ) : (
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
                </>
              )}

              {/* Extra Pay / Charges Section */}
              {canEditCharges && showAdjustmentsForm && (
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

                  {/* Existing extra pay / charges list */}
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
                            onClick={() => handleRemoveAdjustment(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new adjustment form */}
                  <div className="space-y-3 pt-2">
                    <div className="flex gap-2">
                      <Button
                        variant={newAdjustmentType === "addition" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setNewAdjustmentType("addition")}
                      >
                        Extra Pay
                      </Button>
                      <Button
                        variant={newAdjustmentType === "charge" ? "destructive" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setNewAdjustmentType("charge")}
                      >
                        Charge
                      </Button>
                    </div>

                    <Input
                      placeholder="Reason"
                      value={newAdjustmentReason}
                      onChange={(e) => setNewAdjustmentReason(e.target.value)}
                      className="h-8 text-sm"
                    />

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <button
                          type="button"
                          onClick={() =>
                            setAdjustmentAmountMode((m) => (m === "dollar" ? "percent" : "dollar"))
                          }
                          className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title={
                            adjustmentAmountMode === "dollar"
                              ? "Click to switch to % of (gross×1% + comm×5%)"
                              : `Click to switch to $. Base: $${percentBase.toFixed(2)}`
                          }
                          tabIndex={-1}
                        >
                          {adjustmentAmountMode === "dollar" ? "$" : "%"}
                        </button>
                        <Input
                          type="number"
                          placeholder={adjustmentAmountMode === "dollar" ? "Amount" : "Percent"}
                          value={newAdjustmentAmount}
                          onChange={(e) => setNewAdjustmentAmount(e.target.value)}
                          className="h-8 text-sm pl-8"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddAdjustment}
                        disabled={!newAdjustmentReason.trim() || !newAdjustmentAmount}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Penalties Section - visible to all roles incl. dispatch */}
              {(canEditPenalties ? showAdjustmentsForm || penalties.length > 0 : penalties.length > 0) && (
                <div className={canEditCharges && showAdjustmentsForm ? "border-t pt-4 space-y-3" : "space-y-3"}>
                  <div>
                    <h3 className="font-semibold text-sm">Penalties</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Check the box to apply the deduction. Otherwise it will only show as a warning.
                    </p>
                  </div>

                  {/* Existing penalties list */}
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
                          {canEditPenalties && (
                            <Checkbox
                              checked={!!adj.applied}
                              onCheckedChange={(c) => handleTogglePenaltyApplied(index, c as boolean)}
                              className="mt-0.5"
                            />
                          )}
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
                          {canEditPenalties && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => handleRemoveAdjustment(index)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new penalty form */}
                  {canEditPenalties && showAdjustmentsForm && (
                    <div className="space-y-3 pt-2">
                      <Input
                        placeholder="Reason"
                        value={newPenaltyReason}
                        onChange={(e) => setNewPenaltyReason(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <button
                            type="button"
                            onClick={() =>
                              setPenaltyAmountMode((m) => (m === "dollar" ? "percent" : "dollar"))
                            }
                            className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title={
                              penaltyAmountMode === "dollar"
                                ? "Click to switch to % of (gross×1% + comm×5%)"
                                : `Click to switch to $. Base: $${percentBase.toFixed(2)}`
                            }
                            tabIndex={-1}
                          >
                            {penaltyAmountMode === "dollar" ? "$" : "%"}
                          </button>
                          <Input
                            type="number"
                            placeholder={penaltyAmountMode === "dollar" ? "Amount" : "Percent"}
                            value={newPenaltyAmount}
                            onChange={(e) => setNewPenaltyAmount(e.target.value)}
                            className="h-8 text-sm pl-8"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={handleAddPenalty}
                          disabled={!newPenaltyReason.trim() || !newPenaltyAmount}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={newPenaltyApplied}
                          onCheckedChange={(c) => setNewPenaltyApplied(c as boolean)}
                        />
                        <span>Apply as deduction (uncheck for warning only)</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {!previewOnly && (
                <label className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer border transition-colors ${isCheckedState ? "bg-green-100 dark:bg-green-950/30 border-green-300 dark:border-green-800" : "border-input"}`}>
                  <Checkbox
                    checked={isCheckedState}
                    onCheckedChange={handleToggleChecked}
                  />
                  <span className="text-sm font-medium">Checked</span>
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {previewOnly ? "Close" : "Cancel"}
              </Button>
              {pdfUrl && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = pdfUrl;
                    a.download = `${dispatcherName}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
              {!previewOnly && (
                <Button onClick={handleSendEmail} disabled={sending}>
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
              )}
            </div>
          </div>
          {!previewOnly && (
            <div className="flex justify-end w-full">
              <span className="text-xs text-muted-foreground">{recipientEmail}</span>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
