import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { yieldToMain } from "@/utils/yieldToMain";

interface BulkImportDriverExcelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers: Array<{
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    truck_info?: { truck_number: string | null } | null;
  }>;
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

interface SheetMatch {
  sheetName: string;
  truckNumber: string;
  driverNameFromSheet: string;
  status: "matched" | "unmatched" | "ambiguous";
  matchedDriver?: {
    id: string;
    name: string;
    truckNumber: string;
  };
  ambiguousDrivers?: Array<{
    id: string;
    name: string;
  }>;
  parsedData?: ParsedData;
}

// Helper functions for parsing (reused from ImportDriverExcelDialog)
function parseDate(value: any): string | null {
  if (!value) return null;

  if (typeof value === "number") {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }

  const str = String(value).trim();
  if (!str) return null;

  const patterns = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      } else if (pattern === patterns[1]) {
        const [, month, day, shortYear] = match;
        const year =
          parseInt(shortYear) > 50 ? `19${shortYear}` : `20${shortYear}`;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      } else if (pattern === patterns[2]) {
        return str;
      }
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

function parseAmount(value: any): number {
  if (!value) return 0;
  if (typeof value === "number") return value;

  const str = String(value).replace(/[$,]/g, "").trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parseTruckPayment(value: any): { amount: number; weeks: number } | null {
  if (!value) return null;

  const str = String(value).trim();
  const match = str.match(/\$?([\d,]+(?:\.\d+)?)\s*\/\s*(\d+)/);
  if (match) {
    return {
      amount: parseFloat(match[1].replace(/,/g, "")),
      weeks: parseInt(match[2]),
    };
  }
  return null;
}

function parseSheetName(
  sheetName: string
): { truckNumber: string; driverName: string } | null {
  const match = sheetName.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;
  return {
    truckNumber: match[1],
    driverName: match[2].trim(),
  };
}

function normalizeNameForComparison(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

function parseWorksheet(worksheet: XLSX.WorkSheet): ParsedData {
  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  const dealInfo: DriverDealInfo = {
    weekly_payment: null,
    weeks_count: null,
    agreement_start_date: null,
    hire_date: null,
  };

  if (data[1] && data[1][3]) {
    const d2Date = parseDate(data[1][3]);
    if (d2Date) {
      dealInfo.agreement_start_date = d2Date;
      dealInfo.hire_date = d2Date;
    }
  }

  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    for (const cell of row) {
      const payment = parseTruckPayment(cell);
      if (payment && payment.amount > 600) {
        dealInfo.weekly_payment = payment.amount;
        dealInfo.weeks_count = payment.weeks;
      }
    }
  }

  let headerRowIndex = -1;
  let columnMap: Record<string, number> = {};

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const rowStr = row.map((c) => String(c || "").toUpperCase()).join("|");
    if (
      rowStr.includes("TRUCK") &&
      rowStr.includes("EXPLANATION") &&
      rowStr.includes("AMOUNT")
    ) {
      headerRowIndex = i;
      row.forEach((cell, idx) => {
        const header = String(cell || "").toUpperCase().trim();
        if (header.includes("TRUCK") || header.includes("TRL"))
          columnMap["truck"] = idx;
        if (header === "NAME") columnMap["name"] = idx;
        if (header === "EXPLANATION") columnMap["explanation"] = idx;
        if (header === "DATE" && !header.includes("PAID"))
          columnMap["date"] = idx;
        if (header === "AMOUNT" && !header.includes("PAID"))
          columnMap["amount"] = idx;
        if (header === "STATUS") columnMap["status"] = idx;
        if (header.includes("PAID") && header.includes("AMOUNT"))
          columnMap["paid_amount"] = idx;
        if (header.includes("PAID") && header.includes("DATE"))
          columnMap["paid_date"] = idx;
        if (header === "NOTICE 1") columnMap["notice_1"] = idx;
        if (header === "NOTICE 2") columnMap["notice_2"] = idx;
      });
      break;
    }
  }

  const expenses: ParsedExpense[] = [];
  const cashAdvances: ParsedCashAdvance[] = [];

  if (headerRowIndex >= 0) {
    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.every((c) => !c)) continue;

      const explanation = String(row[columnMap["explanation"]] || "").trim();
      if (!explanation) continue;

      const amount = parseAmount(row[columnMap["amount"]]);
      if (amount === 0) continue;

      const truckNumber = row[columnMap["truck"]]
        ? String(row[columnMap["truck"]]).trim()
        : null;
      const expenseDate = parseDate(row[columnMap["date"]]);
      const rawStatus = row[columnMap["status"]];
      const paidDate = parseDate(row[columnMap["paid_date"]]);
      const notice1 = row[columnMap["notice_1"]]
        ? String(row[columnMap["notice_1"]]).trim()
        : null;
      const notice2 = row[columnMap["notice_2"]]
        ? String(row[columnMap["notice_2"]]).trim()
        : null;

      let paidAmount: number | null = null;
      if (columnMap["paid_amount"] !== undefined) {
        const rawPaidAmount = parseAmount(row[columnMap["paid_amount"]]);
        if (rawPaidAmount > 0 && rawPaidAmount <= amount) {
          paidAmount = rawPaidAmount;
        }
      }

      let status: string;
      if (paidAmount !== null && paidAmount > 0) {
        status = paidAmount >= amount ? "paid" : "partial";
      } else {
        const rawStatusStr = String(rawStatus || "").toLowerCase().trim();
        if (
          rawStatusStr === "paid" ||
          rawStatusStr === "partial" ||
          rawStatusStr === "pending"
        ) {
          status = rawStatusStr;
        } else {
          status = "pending";
        }
      }

      const explanationLower = explanation.toLowerCase();

      const isStartDeposit =
        explanationLower.includes("start expenses:") ||
        explanationLower.includes("equipment deposit");
      if (isStartDeposit) {
        continue;
      }

      const isCashAdvance =
        explanationLower.includes("cash advance") ||
        explanationLower.includes("efs money code-cash advance");

      if (isCashAdvance) {
        cashAdvances.push({
          truck_number: truckNumber,
          amount,
          requested_at: expenseDate,
        });
      } else {
        const isFixed =
          explanationLower.includes("escrow") ||
          explanationLower.includes("registration") ||
          explanationLower.includes("permits") ||
          explanationLower.includes("tablet") ||
          explanationLower.includes("highway use tax") ||
          explanationLower.includes("2290");

        expenses.push({
          truck_number: truckNumber,
          explanation,
          expense_date: expenseDate,
          amount,
          status: status || "pending",
          paid_amount: paidAmount,
          paid_date: paidDate,
          notice_1: notice1,
          notice_2: notice2,
          is_fixed: isFixed,
        });
      }
    }
  }

  return { dealInfo, expenses, cashAdvances };
}

export function BulkImportDriverExcelDialog({
  open,
  onOpenChange,
  drivers,
}: BulkImportDriverExcelDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [sheetMatches, setSheetMatches] = useState<SheetMatch[]>([]);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState<{
    drivers: number;
    expenses: number;
    cashAdvances: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const matchedCount = sheetMatches.filter((m) => m.status === "matched").length;
  const unmatchedCount = sheetMatches.filter(
    (m) => m.status === "unmatched"
  ).length;
  const ambiguousCount = sheetMatches.filter(
    (m) => m.status === "ambiguous"
  ).length;

  const matchSheetToDriver = (
    parsed: { truckNumber: string; driverName: string },
    allDrivers: typeof drivers
  ): Omit<SheetMatch, "sheetName" | "truckNumber" | "driverNameFromSheet" | "parsedData"> => {
    const byTruck = allDrivers.filter(
      (d) => d.truck_info?.truck_number === parsed.truckNumber
    );

    if (byTruck.length === 0) {
      return { status: "unmatched" };
    }

    const targetName = normalizeNameForComparison(parsed.driverName);

    const matches = byTruck.filter((d) => {
      const driverName = d.name || `${d.first_name || ""} ${d.last_name || ""}`;
      return normalizeNameForComparison(driverName) === targetName;
    });

    if (matches.length === 1) {
      const driver = matches[0];
      return {
        status: "matched",
        matchedDriver: {
          id: driver.id,
          name: driver.name || `${driver.first_name || ""} ${driver.last_name || ""}`,
          truckNumber: driver.truck_info?.truck_number || "",
        },
      };
    } else if (matches.length > 1) {
      return {
        status: "ambiguous",
        ambiguousDrivers: matches.map((d) => ({
          id: d.id,
          name: d.name || `${d.first_name || ""} ${d.last_name || ""}`,
        })),
      };
    }

    // Fallback: if only one driver with that truck, match them
    if (byTruck.length === 1) {
      const driver = byTruck[0];
      return {
        status: "matched",
        matchedDriver: {
          id: driver.id,
          name: driver.name || `${driver.first_name || ""} ${driver.last_name || ""}`,
          truckNumber: driver.truck_info?.truck_number || "",
        },
      };
    }

    return { status: "unmatched" };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportResult(null);
    setSheetMatches([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const matches: SheetMatch[] = [];

      for (let i = 0; i < workbook.SheetNames.length; i++) {
        const sheetName = workbook.SheetNames[i];
        const parsed = parseSheetName(sheetName);

        if (!parsed) {
          // Skip sheets that don't match the expected format
          continue;
        }

        const matchResult = matchSheetToDriver(parsed, drivers);
        const worksheet = workbook.Sheets[sheetName];
        const parsedData = parseWorksheet(worksheet);

        matches.push({
          sheetName,
          truckNumber: parsed.truckNumber,
          driverNameFromSheet: parsed.driverName,
          ...matchResult,
          parsedData,
        });

        // Yield every 10 sheets to keep UI responsive
        if ((i + 1) % 10 === 0) {
          await yieldToMain();
        }
      }

      setSheetMatches(matches);
      toast.success(
        `Processed ${matches.length} sheets: ${matches.filter((m) => m.status === "matched").length} matched`
      );
    } catch (error) {
      console.error("Error parsing Excel:", error);
      toast.error("Failed to parse Excel file");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImportAll = async () => {
    const matched = sheetMatches.filter(
      (m) => m.status === "matched" && m.matchedDriver && m.parsedData
    );

    if (matched.length === 0) {
      toast.error("No matched drivers to import");
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: matched.length });

    let totalExpenses = 0;
    let totalCashAdvances = 0;
    let successfulDrivers = 0;

    try {
      for (let i = 0; i < matched.length; i++) {
        const match = matched[i];
        const driverId = match.matchedDriver!.id;
        const { dealInfo, expenses, cashAdvances } = match.parsedData!;

        try {
          // Update driver deal info
          if (
            dealInfo.weekly_payment ||
            dealInfo.weeks_count ||
            dealInfo.agreement_start_date ||
            dealInfo.hire_date
          ) {
            const updates: Record<string, any> = {};
            if (dealInfo.weekly_payment)
              updates.weekly_payment = dealInfo.weekly_payment;
            if (dealInfo.weeks_count) updates.weeks_count = dealInfo.weeks_count;
            if (dealInfo.agreement_start_date)
              updates.agreement_start_date = dealInfo.agreement_start_date;
            if (dealInfo.hire_date) updates.hire_date = dealInfo.hire_date;

            await supabase.from("drivers").update(updates).eq("id", driverId);
          }

          // Insert expenses in batches
          if (expenses.length > 0) {
            const expenseRecords = expenses.map((exp) => ({
              driver_id: driverId,
              truck_number: exp.truck_number,
              name: "",
              explanation: exp.explanation,
              expense_date: exp.expense_date,
              amount: exp.amount,
              status: exp.status,
              paid_amount: exp.paid_amount,
              paid_date: exp.paid_date,
              notice_1: exp.notice_1,
              notice_2: exp.notice_2,
              is_fixed: exp.is_fixed,
            }));

            // Insert in batches of 100
            for (let j = 0; j < expenseRecords.length; j += 100) {
              const batch = expenseRecords.slice(j, j + 100);
              const { error } = await supabase
                .from("driver_expenses")
                .insert(batch);
              if (error) throw error;
            }

            totalExpenses += expenses.length;
          }

          // Insert cash advances
          if (cashAdvances.length > 0) {
            const cashAdvanceRecords = cashAdvances.map((ca) => ({
              driver_id: driverId,
              amount: ca.amount,
              requested_at: ca.requested_at || new Date().toISOString(),
              truck_number: ca.truck_number,
            }));

            const { error } = await supabase
              .from("driver_cash_advances")
              .insert(cashAdvanceRecords);
            if (error) throw error;

            totalCashAdvances += cashAdvances.length;
          }

          successfulDrivers++;
        } catch (error) {
          console.error(`Error importing for ${match.sheetName}:`, error);
        }

        setImportProgress({ current: i + 1, total: matched.length });

        // Yield to main thread periodically
        if ((i + 1) % 5 === 0) {
          await yieldToMain();
        }
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["driver-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["driver-cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });

      setImportResult({
        drivers: successfulDrivers,
        expenses: totalExpenses,
        cashAdvances: totalCashAdvances,
      });

      toast.success(
        `Imported ${successfulDrivers} drivers, ${totalExpenses} expenses, ${totalCashAdvances} cash advances`
      );
    } catch (error) {
      console.error("Error during bulk import:", error);
      toast.error("Import failed. See console for details.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setSheetMatches([]);
    setImportResult(null);
    setImportProgress({ current: 0, total: 0 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Bulk Import Driver Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file with multiple sheets (format: "truck_number
            driver_name") to import expenses for all matched drivers at once.
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
              className="max-w-xs"
            />
            {isProcessing && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </div>
            )}
          </div>

          {/* Summary Stats */}
          {sheetMatches.length > 0 && (
            <div className="flex items-center gap-4">
              <Badge
                variant="default"
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Matched: {matchedCount}
              </Badge>
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Unmatched: {unmatchedCount}
              </Badge>
              <Badge variant="secondary">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Ambiguous: {ambiguousCount}
              </Badge>
            </div>
          )}

          {/* Import Progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  Importing {importProgress.current}/{importProgress.total}...
                </span>
                <span>
                  {Math.round(
                    (importProgress.current / importProgress.total) * 100
                  )}
                  %
                </span>
              </div>
              <Progress
                value={(importProgress.current / importProgress.total) * 100}
              />
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <h4 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                Import Complete!
              </h4>
              <ul className="text-sm text-green-600 dark:text-green-400">
                <li>✓ {importResult.drivers} drivers imported</li>
                <li>✓ {importResult.expenses} expenses added</li>
                <li>✓ {importResult.cashAdvances} cash advances added</li>
              </ul>
            </div>
          )}

          {/* Results Table */}
          {sheetMatches.length > 0 && !importResult && (
            <ScrollArea className="h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Matched Driver</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Cash Adv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheetMatches.map((match, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">
                        {match.sheetName}
                      </TableCell>
                      <TableCell>
                        {match.status === "matched" && (
                          <Badge
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Matched
                          </Badge>
                        )}
                        {match.status === "unmatched" && (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            No Match
                          </Badge>
                        )}
                        {match.status === "ambiguous" && (
                          <Badge variant="secondary">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {match.ambiguousDrivers?.length} drivers
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {match.matchedDriver?.name || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {match.parsedData?.expenses.length || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {match.parsedData?.cashAdvances.length || 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              {importResult ? "Done" : "Cancel"}
            </Button>
            {sheetMatches.length > 0 &&
              matchedCount > 0 &&
              !importResult && (
                <Button
                  onClick={handleImportAll}
                  disabled={isImporting}
                  className="gap-2"
                >
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Import {matchedCount} Matched Drivers
                </Button>
              )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
