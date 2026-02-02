import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Send, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePayrollPdf } from "@/utils/payrollPdfGenerator";

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
  foodAllowance: number;
  extraDays: number;
  lostDays: number;
  extraDayDates: string[];
  lostDayDates: string[];
  extraDaysAmount: number;
  dispatcherBonus?: number;
  perDayRate?: number;
  onEmailSent: () => void;
  previewOnly?: boolean; // When true, hide send button and PTO editing
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
  foodAllowance,
  extraDays,
  lostDays,
  extraDayDates,
  lostDayDates,
  extraDaysAmount,
  dispatcherBonus = 0,
  perDayRate = 0,
  onEmailSent,
  previewOnly = false,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [ptoSelections, setPtoSelections] = useState<Record<string, boolean>>({});
  const [usedPtoDaysThisYear, setUsedPtoDaysThisYear] = useState(0);
  const [existingPtoDays, setExistingPtoDays] = useState<string[]>([]);

  const year = parseInt(selectedMonth.split("-")[0], 10);
  const maxPtoDays = 3;

  // Load existing PTO days for this year
  useEffect(() => {
    if (open && dispatcherUserId) {
      loadPtoDays();
    }
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [open, dispatcherUserId]);

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
      });

      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
    } catch (err) {
      console.error("Error generating preview:", err);
      toast.error("Failed to generate preview");
    } finally {
      setLoading(false);
    }
  };

  // Regenerate preview when PTO selections change
  useEffect(() => {
    if (open && !loading) {
      generatePreview();
    }
  }, [ptoSelections]);

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

    setPtoSelections(prev => ({
      ...prev,
      [date]: checked,
    }));
  };

  const handleSendEmail = async () => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      // Save PTO selections
      const selectedPtoDays = Object.entries(ptoSelections)
        .filter(([_, isChecked]) => isChecked)
        .map(([date]) => {
          const [month, day] = date.split("/");
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        });

      // Remove any existing PTO days for this month first
      const monthStart = `${selectedMonth}-01`;
      const monthEnd = `${selectedMonth}-31`;
      await supabase
        .from("dispatcher_sick_days" as any)
        .delete()
        .eq("user_id", dispatcherUserId)
        .gte("sick_date", monthStart)
        .lte("sick_date", monthEnd);

      // Insert new PTO days
      if (selectedPtoDays.length > 0) {
        const { error: insertError } = await supabase
          .from("dispatcher_sick_days" as any)
          .insert(
            selectedPtoDays.map(date => ({
              user_id: dispatcherUserId,
              sick_date: date,
              year,
              created_by: user.id,
            }))
          );

        if (insertError) throw insertError;
      }

      // Get selected PTO dates (MM/DD format)
      const selectedPtoDates = Object.entries(ptoSelections)
        .filter(([_, isChecked]) => isChecked)
        .map(([date]) => date);

      // Generate the final PDF with PTO data
      const pdfBlob = await generatePayrollPdf({
        employeeName: dispatcherName,
        payPeriod,
        salary1Percent,
        bonus5Percent,
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
      });

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

      // Calculate the salary amount (paid_amount = Total Freight * 0.01 + Total Comm. * 0.05 only)
      // This is the simple base rate without extra days, food allowance, etc.
      const paidAmount = salary1Percent + bonus5Percent;

      // Insert new payment record
      await supabase
        .from("dispatcher_salary_payments" as any)
        .insert({
          user_id: dispatcherUserId,
          month: selectedMonth,
          paid_amount: paidAmount,
          calculated_salary: paidAmount,
          paid_at: now,
          paid_by: user.id,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {previewOnly ? "Payroll Statement" : "Payroll Statement Preview"} - {dispatcherName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex gap-4">
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

          {/* PTO Panel - only show if there are days off AND not in preview-only mode */}
          {!previewOnly && lostDayDates.length > 0 && (
            <div className="w-64 border rounded-lg p-4 space-y-4">
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
                      disabled={!ptoSelections[date] && remainingPtoDays - currentMonthPtoSelected <= 0}
                    />
                    <Label htmlFor={`pto-${date}`} className="text-sm cursor-pointer">
                      {date} {ptoSelections[date] && <span className="text-green-600">(PTO)</span>}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {previewOnly ? "Close" : "Cancel"}
          </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
