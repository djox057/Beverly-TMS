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
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sickDaySelections, setSickDaySelections] = useState<Record<string, boolean>>({});
  const [usedSickDaysThisYear, setUsedSickDaysThisYear] = useState(0);
  const [existingSickDays, setExistingSickDays] = useState<string[]>([]);

  const year = parseInt(selectedMonth.split("-")[0], 10);
  const maxSickDays = 3;

  // Load existing sick days for this year
  useEffect(() => {
    if (open && dispatcherUserId) {
      loadSickDays();
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

  const loadSickDays = async () => {
    try {
      const { data, error } = await supabase
        .from("dispatcher_sick_days" as any)
        .select("sick_date")
        .eq("user_id", dispatcherUserId)
        .eq("year", year);

      if (error) throw error;

      const sickDates = (data || []).map((d: any) => d.sick_date);
      setExistingSickDays(sickDates);
      setUsedSickDaysThisYear(sickDates.length);

      // Initialize selections - pre-check dates that are already marked as sick days
      const monthPrefix = selectedMonth; // YYYY-MM
      const initialSelections: Record<string, boolean> = {};
      lostDayDates.forEach(date => {
        // Convert MM/DD format to full date for comparison
        const [month, day] = date.split("/");
        const fullDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        initialSelections[date] = sickDates.includes(fullDate);
      });
      setSickDaySelections(initialSelections);
    } catch (err) {
      console.error("Error loading sick days:", err);
    }
  };

  const generatePreview = async () => {
    setLoading(true);
    try {
      // Get selected sick day dates (MM/DD format)
      const selectedSickDayDates = Object.entries(sickDaySelections)
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
        sickDayDates: selectedSickDayDates,
        totalSickDaysAvailable: maxSickDays,
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

  // Regenerate preview when sick day selections change
  useEffect(() => {
    if (open && !loading) {
      generatePreview();
    }
  }, [sickDaySelections]);

  const handleSickDayToggle = (date: string, checked: boolean) => {
    const currentSelectedCount = Object.values(sickDaySelections).filter(Boolean).length;
    const alreadyUsedBeforeThisMonth = existingSickDays.filter(d => {
      const dateMonth = d.substring(0, 7); // YYYY-MM
      return dateMonth !== selectedMonth;
    }).length;

    const totalIfChecked = alreadyUsedBeforeThisMonth + currentSelectedCount + (checked ? 1 : -1);

    if (checked && totalIfChecked > maxSickDays) {
      toast.error(`Maximum ${maxSickDays} sick days per year. You have ${alreadyUsedBeforeThisMonth} already used.`);
      return;
    }

    setSickDaySelections(prev => ({
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

      // Save sick day selections
      const selectedSickDays = Object.entries(sickDaySelections)
        .filter(([_, isChecked]) => isChecked)
        .map(([date]) => {
          const [month, day] = date.split("/");
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        });

      // Remove any existing sick days for this month first
      const monthStart = `${selectedMonth}-01`;
      const monthEnd = `${selectedMonth}-31`;
      await supabase
        .from("dispatcher_sick_days" as any)
        .delete()
        .eq("user_id", dispatcherUserId)
        .gte("sick_date", monthStart)
        .lte("sick_date", monthEnd);

      // Insert new sick days
      if (selectedSickDays.length > 0) {
        const { error: insertError } = await supabase
          .from("dispatcher_sick_days" as any)
          .insert(
            selectedSickDays.map(date => ({
              user_id: dispatcherUserId,
              sick_date: date,
              year,
              created_by: user.id,
            }))
          );

        if (insertError) throw insertError;
      }

      // Get selected sick day dates (MM/DD format)
      const selectedSickDayDates = Object.entries(sickDaySelections)
        .filter(([_, isChecked]) => isChecked)
        .map(([date]) => date);

      // Generate the final PDF with sick day data
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
        sickDayDates: selectedSickDayDates,
        totalSickDaysAvailable: maxSickDays,
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

  const remainingSickDays = maxSickDays - usedSickDaysThisYear;
  const currentMonthSickDaysSelected = Object.values(sickDaySelections).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Payroll Statement Preview - {dispatcherName}</DialogTitle>
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

          {/* Sick Days Panel - only show if there are days off */}
          {lostDayDates.length > 0 && (
            <div className="w-64 border rounded-lg p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Mark as Sick Days</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Sick days don't reduce salary. {remainingSickDays} of {maxSickDays} remaining this year.
                </p>
              </div>

              {remainingSickDays <= 0 && currentMonthSickDaysSelected === 0 && (
                <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    No sick days remaining for this year.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Days off:</p>
                {lostDayDates.map(date => (
                  <div key={date} className="flex items-center gap-2">
                    <Checkbox
                      id={`sick-${date}`}
                      checked={sickDaySelections[date] || false}
                      onCheckedChange={(checked) => handleSickDayToggle(date, checked as boolean)}
                      disabled={!sickDaySelections[date] && remainingSickDays - currentMonthSickDaysSelected <= 0}
                    />
                    <Label htmlFor={`sick-${date}`} className="text-sm cursor-pointer">
                      {date} {sickDaySelections[date] && <span className="text-green-600">(Sick Day)</span>}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
