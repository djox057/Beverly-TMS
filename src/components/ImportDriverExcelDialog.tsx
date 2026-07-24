import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSpreadsheet, Upload, Copy, Check, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface ImportDriverExcelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
}

interface ParsedExpense {
  truck_number: string | null;
  explanation: string;
  expense_date: string | null;
  amount: number;
  status: string;
  paid_amount: number | null;
  paid_date: string | null;
  notice_1: string | null;
  notice_2: string | null;
  is_fixed: boolean;
}

interface ParsedCashAdvance {
  truck_number: string | null;
  amount: number;
  requested_at: string | null;
}

interface DriverDealInfo {
  weekly_payment: number | null;
  weeks_count: number | null;
  agreement_start_date: string | null;
  hire_date: string | null;
}

interface ParsedData {
  dealInfo: DriverDealInfo;
  expenses: ParsedExpense[];
  cashAdvances: ParsedCashAdvance[];
}

function parseDate(value: any): string | null {
  if (!value) return null;
  
  // Handle Excel serial date numbers
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  
  const str = String(value).trim();
  if (!str) return null;
  
  // Try to parse various date formats
  const patterns = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // M/D/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, // M/D/YY
    /^(\d{4})-(\d{2})-(\d{2})$/        // YYYY-MM-DD
  ];
  
  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else if (pattern === patterns[1]) {
        const [, month, day, shortYear] = match;
        const year = parseInt(shortYear) > 50 ? `19${shortYear}` : `20${shortYear}`;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else if (pattern === patterns[2]) {
        return str;
      }
    }
  }
  
  // Try Date.parse as fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return null;
}

function parseAmount(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  
  const str = String(value).replace(/[$,]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parseTruckPayment(value: any): { amount: number; weeks: number } | null {
  if (!value) return null;
  
  const str = String(value).trim();
  // Match patterns like "$900/208" or "900/208"
  const match = str.match(/\$?([\d,]+(?:\.\d+)?)\s*\/\s*(\d+)/);
  if (match) {
    return {
      amount: parseFloat(match[1].replace(/,/g, '')),
      weeks: parseInt(match[2])
    };
  }
  return null;
}

function generateSqlCode(
  driverId: string,
  driverName: string,
  dealInfo: DriverDealInfo,
  expenses: ParsedExpense[],
  cashAdvances: ParsedCashAdvance[]
): string {
  const lines: string[] = [];
  
  lines.push(`-- SQL Import for Driver: ${driverName}`);
  lines.push(`-- Driver ID: ${driverId}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('');
  
  // Update driver deal info
  if (dealInfo.weekly_payment || dealInfo.weeks_count || dealInfo.agreement_start_date || dealInfo.hire_date) {
    lines.push('-- Update Driver Deal Information');
    const updates: string[] = [];
    if (dealInfo.weekly_payment) updates.push(`weekly_payment = ${dealInfo.weekly_payment}`);
    if (dealInfo.weeks_count) updates.push(`weeks_count = ${dealInfo.weeks_count}`);
    if (dealInfo.agreement_start_date) updates.push(`agreement_start_date = '${dealInfo.agreement_start_date}'`);
    if (dealInfo.hire_date) updates.push(`hire_date = '${dealInfo.hire_date}'`);
    
    lines.push(`UPDATE drivers SET ${updates.join(', ')} WHERE id = '${driverId}';`);
    lines.push('');
  }
  
  // Insert expenses (without name field)
  if (expenses.length > 0) {
    lines.push('-- Insert Expenses');
    for (const exp of expenses) {
      const values = [
        `'${driverId}'`,
        exp.truck_number ? `'${exp.truck_number}'` : 'NULL',
        `'${exp.explanation.replace(/'/g, "''")}'`,
        exp.expense_date ? `'${exp.expense_date}'` : 'NULL',
        exp.amount,
        `'${exp.status}'`,
        exp.paid_amount !== null ? exp.paid_amount : 'NULL',
        exp.paid_date ? `'${exp.paid_date}'` : 'NULL',
        exp.notice_1 ? `'${exp.notice_1.replace(/'/g, "''")}'` : 'NULL',
        exp.notice_2 ? `'${exp.notice_2.replace(/'/g, "''")}'` : 'NULL',
        exp.is_fixed
      ];
      lines.push(`INSERT INTO driver_expenses (driver_id, truck_number, explanation, expense_date, amount, status, paid_amount, paid_date, notice_1, notice_2, is_fixed) VALUES (${values.join(', ')});`);
    }
    lines.push('');
  }
  
  // Insert cash advances
  if (cashAdvances.length > 0) {
    lines.push('-- Insert Cash Advances');
    for (const ca of cashAdvances) {
      const values = [
        `'${driverId}'`,
        ca.amount,
        ca.requested_at ? `'${ca.requested_at}'` : 'NOW()',
        ca.truck_number ? `'${ca.truck_number}'` : 'NULL'
      ];
      lines.push(`INSERT INTO driver_cash_advances (driver_id, amount, requested_at, truck_number) VALUES (${values.join(', ')});`);
    }
  }
  
  return lines.join('\n');
}

export function ImportDriverExcelDialog({ open, onOpenChange, driverId, driverName }: ImportDriverExcelDialogProps) {
  const [sqlCode, setSqlCode] = useState<string>("");
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const parseExcelFile = async (file: File): Promise<ParsedData> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to array of arrays for easier parsing
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Parse deal info from header
    const dealInfo: DriverDealInfo = {
      weekly_payment: null,
      weeks_count: null,
      agreement_start_date: null,
      hire_date: null
    };
    
    // Extract date from cell D2 (row index 1, column index 3) for both agreement_start_date and hire_date
    if (data[1] && data[1][3]) {
      const d2Date = parseDate(data[1][3]);
      if (d2Date) {
        dealInfo.agreement_start_date = d2Date;
        dealInfo.hire_date = d2Date;
      }
    }
    
    // Look for truck payment pattern in first rows
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      
      // Look for truck payment pattern like "$900/208" (must be > $600 to exclude escrow)
      for (const cell of row) {
        const payment = parseTruckPayment(cell);
        if (payment && payment.amount > 600) {
          dealInfo.weekly_payment = payment.amount;
          dealInfo.weeks_count = payment.weeks;
        }
      }
    }
    
    // Find the expense table header row
    let headerRowIndex = -1;
    let columnMap: Record<string, number> = {};
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      
      const rowStr = row.map(c => String(c || '').toUpperCase()).join('|');
      if (rowStr.includes('TRUCK') && rowStr.includes('EXPLANATION') && rowStr.includes('AMOUNT')) {
        headerRowIndex = i;
        row.forEach((cell, idx) => {
          const header = String(cell || '').toUpperCase().trim();
          if (header.includes('TRUCK') || header.includes('TRL')) columnMap['truck'] = idx;
          if (header === 'NAME') columnMap['name'] = idx;
          if (header === 'EXPLANATION') columnMap['explanation'] = idx;
          if (header === 'DATE' && !header.includes('PAID')) columnMap['date'] = idx;
          if (header === 'AMOUNT' && !header.includes('PAID')) columnMap['amount'] = idx;
          if (header === 'STATUS') columnMap['status'] = idx;
          if (header.includes('PAID') && header.includes('AMOUNT')) columnMap['paid_amount'] = idx;
          if (header.includes('PAID') && header.includes('DATE')) columnMap['paid_date'] = idx;
          if (header === 'NOTICE 1') columnMap['notice_1'] = idx;
          if (header === 'NOTICE 2') columnMap['notice_2'] = idx;
        });
        break;
      }
    }
    
    const expenses: ParsedExpense[] = [];
    const cashAdvances: ParsedCashAdvance[] = [];
    
    if (headerRowIndex >= 0) {
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.every(c => !c)) continue;
        
        const explanation = String(row[columnMap['explanation']] || '').trim();
        if (!explanation) continue;
        
        const amount = parseAmount(row[columnMap['amount']]);
        if (amount === 0) continue;
        
        const truckNumber = row[columnMap['truck']] ? String(row[columnMap['truck']]).trim() : null;
        const expenseDate = parseDate(row[columnMap['date']]);
        const rawStatus = row[columnMap['status']];
        const paidDate = parseDate(row[columnMap['paid_date']]);
        const notice1 = row[columnMap['notice_1']] ? String(row[columnMap['notice_1']]).trim() : null;
        const notice2 = row[columnMap['notice_2']] ? String(row[columnMap['notice_2']]).trim() : null;
        
        // Get paid amount from dedicated column if it exists
        let paidAmount: number | null = null;
        if (columnMap['paid_amount'] !== undefined) {
          const rawPaidAmount = parseAmount(row[columnMap['paid_amount']]);
          // Only use if it's a reasonable value (not greater than amount and not too large)
          if (rawPaidAmount > 0 && rawPaidAmount <= amount) {
            paidAmount = rawPaidAmount;
          }
        }
        
        // Determine status based on paid amount
        let status: string;
        if (paidAmount !== null && paidAmount > 0) {
          status = paidAmount >= amount ? 'paid' : 'partial';
        } else {
          // Check raw status column for text status
          const rawStatusStr = String(rawStatus || '').toLowerCase().trim();
          if (rawStatusStr === 'paid' || rawStatusStr === 'partial' || rawStatusStr === 'pending') {
            status = rawStatusStr;
          } else {
            status = 'pending';
          }
        }
        
        const explanationLower = explanation.toLowerCase();
        
        // Skip start deposits and equipment deposits
        const isStartDeposit = explanationLower.includes('start expenses:') ||
                               explanationLower.includes('equipment deposit');
        if (isStartDeposit) {
          continue;
        }
        
        // Check if it's a cash advance
        const isCashAdvance = explanationLower.includes('cash advance') || 
                             explanationLower.includes('efs money code-cash advance');
        
        if (isCashAdvance) {
          cashAdvances.push({
            truck_number: truckNumber,
            amount,
            requested_at: expenseDate
          });
        } else {
          // Determine if it's a fixed expense
          const isFixed = explanationLower.includes('escrow') ||
                         explanationLower.includes('registration') ||
                         explanationLower.includes('permits') ||
                         explanationLower.includes('tablet') ||
                         explanationLower.includes('highway use tax') ||
                         explanationLower.includes('2290');
          
          expenses.push({
            truck_number: truckNumber,
            explanation,
            expense_date: expenseDate,
            amount,
            status: status || 'pending',
            paid_amount: paidAmount,
            paid_date: paidDate,
            notice_1: notice1,
            notice_2: notice2,
            is_fixed: isFixed
          });
        }
      }
    }
    
    return { dealInfo, expenses, cashAdvances };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const parsed = await parseExcelFile(file);
      setParsedData(parsed);
      
      const sql = generateSqlCode(driverId, driverName, parsed.dealInfo, parsed.expenses, parsed.cashAdvances);
      setSqlCode(sql);
      toast.success(`Parsed ${parsed.expenses.length} expenses and ${parsed.cashAdvances.length} cash advances`);
    } catch (error) {
      console.error("Error parsing Excel:", error);
      toast.error("Failed to parse Excel file");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDirectImport = async () => {
    if (!parsedData) return;

    setIsImporting(true);
    try {
      const { dealInfo, expenses, cashAdvances } = parsedData;

      // Update driver deal info
      if (dealInfo.weekly_payment || dealInfo.weeks_count || dealInfo.agreement_start_date || dealInfo.hire_date) {
        const updates: Record<string, any> = {};
        if (dealInfo.weekly_payment) updates.weekly_payment = dealInfo.weekly_payment;
        if (dealInfo.weeks_count) updates.weeks_count = dealInfo.weeks_count;
        if (dealInfo.agreement_start_date) updates.agreement_start_date = dealInfo.agreement_start_date;
        if (dealInfo.hire_date) updates.hire_date = dealInfo.hire_date;

        const { error: driverError } = await supabase
          .from('drivers')
          .update(updates as never)
          .eq('id', driverId);

        if (driverError) {
          throw new Error(`Failed to update driver: ${driverError.message}`);
        }
      }

      // Insert expenses (without name field)
      if (expenses.length > 0) {
        const expenseRecords = expenses.map(exp => ({
          driver_id: driverId,
          truck_number: exp.truck_number,
          name: '', // Empty name as requested
          explanation: exp.explanation,
          expense_date: exp.expense_date,
          amount: exp.amount,
          status: exp.status,
          paid_amount: exp.paid_amount,
          paid_date: exp.paid_date,
          notice_1: exp.notice_1,
          notice_2: exp.notice_2,
          is_fixed: exp.is_fixed
        }));

        const { error: expenseError } = await supabase
          .from('driver_expenses')
          .insert(expenseRecords);

        if (expenseError) {
          throw new Error(`Failed to insert expenses: ${expenseError.message}`);
        }
      }

      // Insert cash advances AND linked expenses (same behavior as edge function)
      if (cashAdvances.length > 0) {
        for (const ca of cashAdvances) {
          const { data: insertedAdvance, error: caError } = await supabase
            .from("driver_cash_advances")
            .insert({
              driver_id: driverId,
              amount: ca.amount,
              requested_at: ca.requested_at || new Date().toISOString(),
              truck_number: ca.truck_number,
            })
            .select("id")
            .single();

          if (caError) {
            throw new Error(`Failed to insert cash advance: ${caError.message}`);
          }

          // Create linked driver_expense
          const expenseDate = ca.requested_at ? ca.requested_at.split("T")[0] : null;
          await supabase.from("driver_expenses").insert({
            driver_id: driverId,
            truck_number: ca.truck_number,
            name: "Cash Advance",
            explanation: "Cash Advance",
            amount: ca.amount,
            status: "pending",
            paid_amount: 0,
            is_fixed: false,
            cash_advance_id: insertedAdvance.id,
            expense_date: expenseDate,
          });
        }
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['driver-expenses', driverId] });
      queryClient.invalidateQueries({ queryKey: ['driver-cash-advances', driverId] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });

      toast.success(`Successfully imported ${expenses.length} expenses and ${cashAdvances.length} cash advances`);
      
      // Reset state and close dialog
      setParsedData(null);
      setSqlCode('');
      onOpenChange(false);
    } catch (error) {
      console.error("Error importing data:", error);
      toast.error(error instanceof Error ? error.message : "Failed to import data");
    } finally {
      setIsImporting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sqlCode);
      setCopied(true);
      toast.success("SQL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Excel for {driverName}
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to import expenses and cash advances. You can either import directly or copy the SQL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          <div className="flex items-center gap-4">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={isProcessing || isImporting}
              className="flex-1"
            />
            {isProcessing && (
              <span className="text-sm text-muted-foreground">Processing...</span>
            )}
          </div>

          {/* Driver Info */}
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <p><strong>Driver ID:</strong> <code className="text-xs bg-muted px-1 rounded">{driverId}</code></p>
            <p><strong>Driver Name:</strong> {driverName}</p>
          </div>

          {/* Parsed Summary */}
          {parsedData && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">Parsed Data Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Expenses:</span> {parsedData.expenses.length}
                </div>
                <div>
                  <span className="text-muted-foreground">Cash Advances:</span> {parsedData.cashAdvances.length}
                </div>
                {parsedData.dealInfo.weekly_payment && (
                  <div>
                    <span className="text-muted-foreground">Weekly Payment:</span> ${parsedData.dealInfo.weekly_payment}
                  </div>
                )}
                {parsedData.dealInfo.weeks_count && (
                  <div>
                    <span className="text-muted-foreground">Weeks Count:</span> {parsedData.dealInfo.weeks_count}
                  </div>
                )}
                {parsedData.dealInfo.hire_date && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Hire/Agreement Date:</span> {parsedData.dealInfo.hire_date}
                  </div>
                )}
              </div>
              
              <div className="mt-3 flex gap-2">
                <Button onClick={handleDirectImport} disabled={isImporting} className="flex-1">
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Import to Database
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* SQL Output */}
          {sqlCode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Generated SQL (for reference)</h4>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <ScrollArea className="h-[300px] border rounded-lg">
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap">{sqlCode}</pre>
              </ScrollArea>
            </div>
          )}

          {!sqlCode && !isProcessing && (
            <div className="text-center py-12 text-muted-foreground">
              <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Upload an Excel file to import data</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
