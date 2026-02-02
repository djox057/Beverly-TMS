import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDown, Loader2, DollarSign, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { DriverExpense, calculateExpenseStatus } from "@/hooks/useDriverExpenses";
import { formatInTimeZone } from "date-fns-tz";
import { useQueryClient } from "@tanstack/react-query";

// Get current date in Chicago timezone
function getChicagoDate(): string {
  return formatInTimeZone(new Date(), "America/Chicago", "yyyy-MM-dd");
}

export interface ScheduledDeduction {
  expenseId: string;
  explanation: string;
  totalAmount: number;
  remainingAmount: number;
  deductionAmount: number;
}

interface StatementPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  truckNumber: string;
  weekStart: string;
  weekEnd: string;
  // The actual export function that generates the Excel
  onExport: (scheduledDeductions: ScheduledDeduction[]) => Promise<void>;
  // Optional callback to mark the week as paid when exporting
  onMarkWeekPaid?: () => Promise<void>;
}

export const StatementPreviewDialog: React.FC<StatementPreviewDialogProps> = ({
  open,
  onOpenChange,
  driverId,
  driverName,
  truckNumber,
  weekStart,
  weekEnd,
  onExport,
  onMarkWeekPaid,
}) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expenses, setExpenses] = useState<DriverExpense[]>([]);
  const [deductionAmounts, setDeductionAmounts] = useState<Record<string, string>>({});
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  
  // Inline add expense form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ explanation: "", amount: "" });

  // Load unpaid expenses when dialog opens
  useEffect(() => {
    if (open && driverId) {
      loadUnpaidExpenses();
      // Reset add form when dialog opens
      setShowAddForm(false);
      setNewExpense({ explanation: "", amount: "" });
    }
  }, [open, driverId]);

  const loadUnpaidExpenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("driver_expenses")
        .select("*")
        .eq("driver_id", driverId)
        .in("status", ["pending", "partial"])
        .order("created_at", { ascending: true });

      if (error) throw error;
      setExpenses(data || []);
      
      // Reset selections
      setSelectedExpenses(new Set());
      setDeductionAmounts({});
    } catch (err) {
      console.error("Error loading expenses:", err);
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  // Handle adding a new expense inline
  const handleAddExpense = async () => {
    if (!newExpense.explanation.trim() || !newExpense.amount) {
      toast.error("Please enter both explanation and amount");
      return;
    }
    
    const amount = parseFloat(newExpense.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    setAddingExpense(true);
    try {
      const { data, error } = await supabase
        .from("driver_expenses")
        .insert({
          driver_id: driverId,
          name: driverName,
          explanation: newExpense.explanation.trim(),
          amount: amount,
          expense_date: getChicagoDate(),
          truck_number: truckNumber || null,
          status: "pending",
          is_fixed: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Add to local state and auto-select it
      setExpenses(prev => [...prev, data]);
      setSelectedExpenses(prev => new Set([...prev, data.id]));
      setDeductionAmounts(prev => ({
        ...prev,
        [data.id]: amount.toFixed(2),
      }));
      
      // Reset form
      setNewExpense({ explanation: "", amount: "" });
      setShowAddForm(false);
      
      // Invalidate cache so Stuff page updates
      queryClient.invalidateQueries({ queryKey: ["driver-expenses", driverId] });
      
      toast.success("Expense added and selected for deduction");
    } catch (err) {
      console.error("Error adding expense:", err);
      toast.error("Failed to add expense");
    } finally {
      setAddingExpense(false);
    }
  };

  // Calculate remaining amount for each expense
  const expensesWithRemaining = useMemo(() => {
    return expenses.map(exp => ({
      ...exp,
      remainingAmount: exp.amount - (exp.paid_amount || 0),
    }));
  }, [expenses]);

  // Handle checkbox toggle
  const handleToggleExpense = (expenseId: string, checked: boolean) => {
    const newSelected = new Set(selectedExpenses);
    if (checked) {
      newSelected.add(expenseId);
      // Default to remaining amount
      const expense = expensesWithRemaining.find(e => e.id === expenseId);
      if (expense) {
        setDeductionAmounts(prev => ({
          ...prev,
          [expenseId]: expense.remainingAmount.toFixed(2),
        }));
      }
    } else {
      newSelected.delete(expenseId);
      setDeductionAmounts(prev => {
        const newAmounts = { ...prev };
        delete newAmounts[expenseId];
        return newAmounts;
      });
    }
    setSelectedExpenses(newSelected);
  };

  // Handle deduction amount change
  const handleAmountChange = (expenseId: string, value: string) => {
    setDeductionAmounts(prev => ({
      ...prev,
      [expenseId]: value,
    }));
  };

  // Get scheduled deductions for export
  const getScheduledDeductions = (): ScheduledDeduction[] => {
    return Array.from(selectedExpenses)
      .map(expenseId => {
        const expense = expensesWithRemaining.find(e => e.id === expenseId);
        if (!expense) return null;
        
        const deductionAmount = parseFloat(deductionAmounts[expenseId] || "0");
        if (deductionAmount <= 0) return null;
        
        return {
          expenseId: expense.id,
          explanation: expense.explanation,
          totalAmount: expense.amount,
          remainingAmount: expense.remainingAmount,
          deductionAmount,
        };
      })
      .filter((d): d is ScheduledDeduction => d !== null);
  };

  // Calculate total deductions
  const totalDeductions = useMemo(() => {
    return Array.from(selectedExpenses).reduce((total, expenseId) => {
      const amount = parseFloat(deductionAmounts[expenseId] || "0");
      return total + (isNaN(amount) ? 0 : amount);
    }, 0);
  }, [selectedExpenses, deductionAmounts]);

  // Handle export with deductions
  const handleExport = async () => {
    setExporting(true);
    try {
      const scheduledDeductions = getScheduledDeductions();
      
      // Call the export function first
      await onExport(scheduledDeductions);
      
      // Update paid_amount for each expense
      for (const deduction of scheduledDeductions) {
        const expense = expenses.find(e => e.id === deduction.expenseId);
        if (!expense) continue;
        
        const newPaidAmount = (expense.paid_amount || 0) + deduction.deductionAmount;
        const newStatus = calculateExpenseStatus(expense.amount, newPaidAmount);
        
        const { error } = await supabase
          .from("driver_expenses")
          .update({
            paid_amount: newPaidAmount,
            paid_date: newPaidAmount > 0 ? getChicagoDate() : null,
            status: newStatus,
          })
          .eq("id", expense.id);
        
        if (error) {
          console.error("Error updating expense:", error);
          toast.error(`Failed to update expense: ${expense.explanation}`);
        }
      }
      
      // Mark the week as paid
      if (onMarkWeekPaid) {
        await onMarkWeekPaid();
      }
      
      // Invalidate cache to refresh Stuff page
      queryClient.invalidateQueries({ queryKey: ["driver-expenses", driverId] });
      
      if (scheduledDeductions.length > 0) {
        toast.success(`Statement exported with ${scheduledDeductions.length} scheduled deduction(s)`);
      }
      
      onOpenChange(false);
    } catch (err) {
      console.error("Error exporting statement:", err);
      toast.error("Failed to export statement");
    } finally {
      setExporting(false);
    }
  };

  // Handle export without deductions (just download)
  const handleExportWithoutDeductions = async () => {
    setExporting(true);
    try {
      await onExport([]);
      
      // Mark the week as paid
      if (onMarkWeekPaid) {
        await onMarkWeekPaid();
      }
      
      onOpenChange(false);
    } catch (err) {
      console.error("Error exporting statement:", err);
      toast.error("Failed to export statement");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl min-h-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Export Statement - {driverName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Truck {truckNumber} • {weekStart} to {weekEnd}
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* Expenses Section */}
          <div className="border rounded-lg p-4 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-sm">Scheduled Deductions</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select expenses to deduct from this week's statement
                </p>
              </div>
              <div className="flex items-center gap-2">
                {totalDeductions > 0 && (
                  <Badge variant="destructive" className="text-sm">
                    Total: {formatCurrency(totalDeductions)}
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="h-7 px-2"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>
            
            {/* Inline Add Expense Form */}
            {showAddForm && (
              <div className="border rounded-lg p-3 mb-3 bg-muted/50">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Explanation</Label>
                    <Input
                      value={newExpense.explanation}
                      onChange={(e) => setNewExpense(prev => ({ ...prev, explanation: e.target.value }))}
                      placeholder="e.g., Toll violation, Equipment damage"
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">Amount</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newExpense.amount}
                        onChange={(e) => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="0.00"
                        className="pl-7 h-8 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddExpense}
                    disabled={addingExpense}
                    className="h-8"
                  >
                    {addingExpense ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewExpense({ explanation: "", amount: "" });
                    }}
                    className="h-8 px-2"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : expensesWithRemaining.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No unpaid expenses found for this driver
              </div>
            ) : (
              <ScrollArea className="flex-1 -mx-4 px-4 max-h-[600px] overflow-y-auto">
                <div className="space-y-3">
                  {expensesWithRemaining.map(expense => (
                    <div
                      key={expense.id}
                      className={`border rounded-lg p-3 transition-colors ${
                        selectedExpenses.has(expense.id) ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`expense-${expense.id}`}
                          checked={selectedExpenses.has(expense.id)}
                          onCheckedChange={(checked) => 
                            handleToggleExpense(expense.id, checked as boolean)
                          }
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Label 
                              htmlFor={`expense-${expense.id}`} 
                              className="font-medium cursor-pointer"
                            >
                              {expense.explanation}
                            </Label>
                            <Badge variant="outline" className="text-xs">
                              {expense.status === "partial" ? "Partial" : "Unpaid"}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            <span>Total: {formatCurrency(expense.amount)}</span>
                            <span className="mx-2">•</span>
                            <span>Paid: {formatCurrency(expense.paid_amount || 0)}</span>
                            <span className="mx-2">•</span>
                            <span className="font-medium text-foreground">
                              Remaining: {formatCurrency(expense.remainingAmount)}
                            </span>
                          </div>
                          {expense.notice_1 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {expense.notice_1}
                            </div>
                          )}
                        </div>
                        
                        {selectedExpenses.has(expense.id) && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">
                              Deduct:
                            </Label>
                            <div className="relative w-28">
                              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max={expense.remainingAmount}
                                value={deductionAmounts[expense.id] || ""}
                                onChange={(e) => handleAmountChange(expense.id, e.target.value)}
                                className="pl-7 h-8 text-sm"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {expensesWithRemaining.length > 0 && selectedExpenses.size === 0 && (
            <Button 
              variant="secondary"
              onClick={handleExportWithoutDeductions} 
              disabled={exporting}
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Without Deductions
                </>
              )}
            </Button>
          )}
          <Button 
            onClick={handleExport} 
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                {selectedExpenses.size > 0 
                  ? `Export with ${selectedExpenses.size} Deduction${selectedExpenses.size > 1 ? "s" : ""}`
                  : "Export Statement"
                }
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
