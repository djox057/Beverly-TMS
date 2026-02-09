import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Upload, User, Trash2, Edit2, Image, TrendingDown, BarChart3, FileSpreadsheet, Filter } from "lucide-react";
import { useDriverExpenses, DriverExpense, NewDriverExpense } from "@/hooks/useDriverExpenses";
import { useDriverCashAdvance } from "@/hooks/useDriverCashAdvance";
import { AddDriverExpenseDialog } from "./AddDriverExpenseDialog";
import { ImportDriverExcelDialog } from "./ImportDriverExcelDialog";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateNoTimezone } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuthContext } from "@/contexts/AuthContext";
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
import { DriverSalariesSection } from "./DriverSalariesSection";

// Fixed weekly charges (same for all drivers)
const FIXED_WEEKLY_CHARGES = {
  cargoInsurance: { name: "Cargo Insurance", amount: 285, frequency: "Weekly" },
  trailerInsurance: { name: "Trailer + Insurance", amount: 285, frequency: "Weekly" },
  eld: { name: "ELD", amount: 50, frequency: "Weekly" },
  prePass: { name: "Pre-Pass", amount: 20, frequency: "Weekly" },
  truckInsurance: { name: "Truck Insurance", amount: 195, frequency: "Weekly" },
};

const TOTAL_FIXED_WEEKLY = Object.values(FIXED_WEEKLY_CHARGES).reduce((sum, c) => sum + c.amount, 0);

interface Driver {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  truck_number?: string | null;
  trailer_number?: string | null;
  company_name?: string | null;
  dispatcher_name?: string | null;
  hire_date?: string | null;
  cdl_expiration_date?: string | null;
  medical_card_expiration_date?: string | null;
  weekly_payment?: number | null;
  weeks_count?: number | null;
  agreement_start_date?: string | null;
}

interface DriverProfileProps {
  driver: Driver;
  onBack: () => void;
}

export function DriverProfile({ driver, onBack }: DriverProfileProps) {
  const { roles } = useAuthContext();
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  const isAccounting = roles.includes("accounting");
  const canDeleteFixedOrYearly = isAdmin || isManager || isAccounting;
  
  const [showAddExpenseDialog, setShowAddExpenseDialog] = useState(false);
  const [showImportExcelDialog, setShowImportExcelDialog] = useState(false);
  const [cdlImageUrl, setCdlImageUrl] = useState<string | null>(null);
  const [isUploadingCdl, setIsUploadingCdl] = useState(false);
  const [editingExpense, setEditingExpense] = useState<DriverExpense | null>(null);
  const [showDebtGraph, setShowDebtGraph] = useState(false);
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState<DriverExpense | null>(null);

  const { expenses, isLoading, addExpense, updateExpense, deleteExpense, initializeDefaultExpenses, isAdding, isUpdating } = useDriverExpenses(driver.id);
  const { data: cashAdvanceData } = useDriverCashAdvance(driver.id);

  // Calculate debt from unpaid expenses (now includes cash advances as expenses)
  // Credits (expense_type = 'credit') subtract from debt
  // currentDebt excludes yearly expenses, totalDebt includes everything
  const { currentDebt, totalDebt, debtHistory } = useMemo(() => {
    // Calculate unpaid expense debt (includes cash advances since they're now expenses)
    const unpaidExpenses = expenses.filter(e => e.status !== 'paid');
    let current = 0; // Excludes yearly
    let total = 0;   // Includes everything
    
    unpaidExpenses.forEach(e => {
      const remaining = e.amount - (e.paid_amount || 0);
      if (e.expense_type === 'company_expense') {
        // Company expenses don't count toward any debt
        return;
      } else if (e.expense_type === 'credit') {
        current -= remaining; // Credits subtract from both
        total -= remaining;
      } else if (e.expense_type === 'yearly') {
        total += remaining; // Yearly only adds to total
      } else {
        current += remaining; // Regular expenses add to both
        total += remaining;
      }
    });

    // Build weekly debt history (mock data based on weeks_count for now)
    const weeksCount = driver.weeks_count || 0;
    const history: { week: string; debt: number }[] = [];
    
    // Generate last 12 weeks of history
    for (let i = Math.max(0, weeksCount - 11); i <= weeksCount; i++) {
      // Simulate debt decreasing over time as payments are made
      const weekDebt = Math.max(0, total + (weeksCount - i) * 100);
      history.push({
        week: `W${i}`,
        debt: weekDebt
      });
    }

    return { currentDebt: current, totalDebt: total, debtHistory: history };
  }, [expenses, driver.weeks_count]);

  // Initialize default expenses on first view
  useEffect(() => {
    if (driver.id) {
      initializeDefaultExpenses(driver.id);
    }
  }, [driver.id]);

  // Fetch CDL image from driver files
  useEffect(() => {
    const fetchCdlImage = async () => {
      const { data } = await supabase
        .from("driver_files")
        .select("file_path, file_name")
        .eq("driver_id", driver.id)
        .ilike("file_name", "%cdl%")
        .limit(1);

      if (data && data.length > 0) {
        const { data: urlData } = supabase.storage
          .from("driver-files")
          .getPublicUrl(data[0].file_path);
        setCdlImageUrl(urlData?.publicUrl || null);
      }
    };
    fetchCdlImage();
  }, [driver.id]);

  const handleCdlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCdl(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `cdl_${driver.id}.${fileExt}`;
      const filePath = `${driver.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("driver-files")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Save to driver_files table
      await supabase.from("driver_files").upsert({
        driver_id: driver.id,
        file_name: `CDL_${driver.name || "Driver"}.${fileExt}`,
        file_path: filePath,
        content_type: file.type,
        file_size: file.size,
      }, { onConflict: 'driver_id,file_name' });

      const { data: urlData } = supabase.storage
        .from("driver-files")
        .getPublicUrl(filePath);

      setCdlImageUrl(urlData?.publicUrl || null);
      toast.success("CDL image uploaded successfully");
    } catch (error) {
      console.error("Error uploading CDL:", error);
      toast.error("Failed to upload CDL image");
    } finally {
      setIsUploadingCdl(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "paid":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "company_expense":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "pending":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "partial":
        return "bg-cyan-500/10 text-cyan-600 border-cyan-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleAddExpense = (expense: NewDriverExpense) => {
    addExpense(expense);
  };

  const handleUpdateExpense = (id: string, updates: Partial<DriverExpense>) => {
    updateExpense({ id, ...updates });
    setEditingExpense(null);
  };

  // Filter and sort expenses for display
  // Sort: fixed expenses (Start Expenses) first, then by created_at
  const allItems = useMemo(() => {
    let items = [...expenses];

    // Apply unpaid filter if enabled
    if (showUnpaidOnly) {
      items = items.filter(item => item.status === 'pending' || item.status === 'partial');
    }

    // Sort: fixed expenses first, then by created_at
    return items.sort((a, b) => {
      if (a.is_fixed && !b.is_fixed) return -1;
      if (!a.is_fixed && b.is_fixed) return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [expenses, showUnpaidOnly]);

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Driver Profile</h1>
      </div>

      {/* Driver Info Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-6">
            {/* CDL Image */}
            <div className="flex-shrink-0">
              <div className="w-40 h-28 border-2 border-dashed border-muted rounded-lg overflow-hidden relative flex items-center justify-center bg-muted/50">
                {cdlImageUrl ? (
                  <img
                    src={cdlImageUrl}
                    alt="CDL"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Image className="h-8 w-8 mx-auto mb-1" />
                    <span className="text-xs">CDL Photo</span>
                  </div>
                )}
                <label className="absolute inset-0 cursor-pointer hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                  <Upload className="h-6 w-6 text-white" />
                  <Input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCdlUpload}
                    disabled={isUploadingCdl}
                  />
                </label>
              </div>
            </div>

            {/* Driver Details */}
            <div className="flex-1 grid grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <p className="font-semibold">{driver.name || `${driver.first_name} ${driver.last_name}`}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Phone</label>
                <p className="font-medium">{driver.phone || "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <p className="font-medium truncate">{driver.email || "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Company</label>
                <p className="font-medium">{driver.company_name || "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Truck</label>
                <p className="font-medium">{driver.truck_number || "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Trailer</label>
                <p className="font-medium">{driver.trailer_number || "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hire Date</label>
                <p className="font-medium">
                  {driver.hire_date ? formatDateNoTimezone(driver.hire_date) : "-"}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Dispatcher</label>
                <p className="font-medium">{driver.dispatcher_name || "-"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Driver Deal Section */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              Driver Deal
              <Badge variant="outline" className="text-xs font-normal">
                {driver.name || `${driver.first_name} ${driver.last_name}`}
              </Badge>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDebtGraph(!showDebtGraph)}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              {showDebtGraph ? "Hide Graph" : "Show Graph"}
            </Button>
          </div>
          {driver.agreement_start_date && (
            <p className="text-sm text-muted-foreground">
              Deal Start: {formatDateNoTimezone(driver.agreement_start_date)} | Truck - Lease to Own, Trailer Rent
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Fixed Weekly Charges Table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>CHARGE</TableHead>
                  <TableHead className="text-right">AMOUNT</TableHead>
                  <TableHead>PAYMENT</TableHead>
                  <TableHead>NOTICE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(FIXED_WEEKLY_CHARGES).map(([key, charge]) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium">{charge.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(charge.amount)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{charge.frequency}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">-</TableCell>
                  </TableRow>
                ))}
                {/* Truck Payment - driver specific */}
                {driver.weekly_payment && driver.weekly_payment > 0 && (() => {
                  // Calculate payments made from agreement start date
                  const paymentsMade = driver.agreement_start_date 
                    ? Math.max(0, Math.floor((Date.now() - new Date(driver.agreement_start_date + 'T00:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000)))
                    : 0;
                  const totalPayments = driver.weeks_count || 156;
                  
                  return (
                    <TableRow>
                      <TableCell className="font-medium">
                        Truck Payment
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({paymentsMade}/{totalPayments} Payments Made)
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(driver.weekly_payment)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Weekly</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {driver.agreement_start_date 
                          ? new Date(driver.agreement_start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
                          : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })()}
                {/* Fuel Discount */}
                <TableRow>
                  <TableCell className="font-medium">Fuel Discount</TableCell>
                  <TableCell className="text-right">$0.25/Gallon</TableCell>
                  <TableCell>
                    <Badge variant="outline">Month to Month</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">-</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Debt Summary */}
          {(() => {
            // Calculate payments made from agreement start date
            const paymentsMade = driver.agreement_start_date 
              ? Math.max(0, Math.floor((Date.now() - new Date(driver.agreement_start_date + 'T00:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000)))
              : 0;
            const totalPayments = driver.weeks_count || 156;
            
            // Calculate days in company from hire date
            const daysInCompany = driver.hire_date
              ? Math.max(0, Math.floor((Date.now() - new Date(driver.hire_date + 'T00:00:00').getTime()) / (24 * 60 * 60 * 1000)))
              : 0;
            
            return (
              <div className="grid grid-cols-5 gap-4">
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Weekly Fixed</p>
                    <p className="text-lg font-bold">{formatCurrency(TOTAL_FIXED_WEEKLY + (driver.weekly_payment || 0))}</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Days in Company</p>
                    <p className="text-lg font-bold">{daysInCompany}</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Payments Made</p>
                    <p className="text-lg font-bold">{paymentsMade} / {totalPayments}</p>
                  </CardContent>
                </Card>
                <Popover>
                  <PopoverTrigger asChild>
                    <Card className={`cursor-pointer ${currentDebt > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-green-500/10 border-green-500/30'}`}>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          Current Debt
                        </p>
                        <p className={`text-lg font-bold ${currentDebt > 0 ? 'text-destructive' : 'text-green-600'}`}>
                          {formatCurrency(currentDebt)}
                        </p>
                      </CardContent>
                    </Card>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <p className="text-sm">All debt without yearly expenses</p>
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Card className={`cursor-pointer ${totalDebt > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          Total Debt
                        </p>
                        <p className={`text-lg font-bold ${totalDebt > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                          {formatCurrency(totalDebt)}
                        </p>
                      </CardContent>
                    </Card>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <p className="text-sm">All debt including yearly expenses</p>
                  </PopoverContent>
                </Popover>
              </div>
            );
          })()}

          {/* Debt Graph */}
          {showDebtGraph && debtHistory.length > 0 && (
            <div className="h-[200px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={debtHistory}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${v}`} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number) => [formatCurrency(value), 'Debt']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="debt" 
                    stroke="hsl(var(--destructive))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--destructive))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Expenses & Cash Advances</CardTitle>
          <div className="flex gap-2">
            <Button 
              variant={showUnpaidOnly ? "default" : "outline"} 
              size="sm" 
              onClick={() => setShowUnpaidOnly(!showUnpaidOnly)}
            >
              <Filter className="h-4 w-4 mr-1" />
              {showUnpaidOnly ? "Show All" : "Unpaid Only"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImportExcelDialog(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              Import Excel
            </Button>
            <Button size="sm" onClick={() => setShowAddExpenseDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Expense
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">TRUCK/TRL</TableHead>
                <TableHead className="w-[80px]">TYPE</TableHead>
                <TableHead className="w-[100px]">NAME</TableHead>
                <TableHead>EXPLANATION</TableHead>
                <TableHead className="w-[100px]">DATE</TableHead>
                <TableHead className="w-[100px] text-right">AMOUNT</TableHead>
                <TableHead className="w-[80px]">STATUS</TableHead>
                <TableHead className="w-[100px]">PAID DATE</TableHead>
                <TableHead className="w-[100px] text-right">PAID AMT</TableHead>
                <TableHead className="w-[120px]">NOTICE 1</TableHead>
                <TableHead className="w-[120px]">NOTICE 2</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : allItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    No expenses found
                  </TableCell>
                </TableRow>
              ) : (
                allItems.map((item) => {
                  const isCashAdvance = !!item.cash_advance_id;
                  const expenseType = item.expense_type || 'expense';
                  const typeColors: Record<string, string> = {
                    expense: 'bg-muted text-muted-foreground',
                    yearly: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                    credit: 'bg-green-500/10 text-green-600 border-green-500/20',
                    company_expense: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
                  };
                  // For company_expense type, override status display
                  const displayStatus = expenseType === 'company_expense' ? 'Company Expense' : item.status;
                  const statusColorClass = expenseType === 'company_expense' 
                    ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' 
                    : getStatusColor(item.status);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">
                        {item.truck_number || "-"}/{item.trailer_number || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={typeColors[expenseType]} variant="outline">
                          {expenseType.charAt(0).toUpperCase() + expenseType.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.explanation}</TableCell>
                      <TableCell>
                        {item.expense_date ? formatDateNoTimezone(item.expense_date) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColorClass} variant="outline">
                          {displayStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.paid_date ? formatDateNoTimezone(item.paid_date) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.paid_amount ? formatCurrency(item.paid_amount) : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{item.notice_1 || "-"}</TableCell>
                      <TableCell className="text-xs">{item.notice_2 || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {/* Edit button - works for all expenses including cash advances */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditingExpense(item)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          {/* Delete button: only admin/manager/accounting can delete any expense */}
                          {canDeleteFixedOrYearly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setDeleteConfirmExpense(item)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <AddDriverExpenseDialog
        open={showAddExpenseDialog}
        onOpenChange={setShowAddExpenseDialog}
        driverId={driver.id}
        driverName={driver.name || `${driver.first_name} ${driver.last_name}`}
        truckNumber={driver.truck_number || undefined}
        trailerNumber={driver.trailer_number || undefined}
        onSubmit={handleAddExpense}
        isSubmitting={isAdding}
      />

      {/* Edit Expense Dialog */}
      {editingExpense && (
        <AddDriverExpenseDialog
          open={!!editingExpense}
          onOpenChange={(open) => !open && setEditingExpense(null)}
          driverId={driver.id}
          driverName={editingExpense.name}
          truckNumber={editingExpense.truck_number || undefined}
          trailerNumber={editingExpense.trailer_number || undefined}
          onSubmit={(expense) => handleUpdateExpense(editingExpense.id, expense)}
          isSubmitting={isUpdating}
          initialData={editingExpense}
        />
      )}

      {/* Import Excel Dialog */}
      <ImportDriverExcelDialog
        open={showImportExcelDialog}
        onOpenChange={setShowImportExcelDialog}
        driverId={driver.id}
        driverName={driver.name || `${driver.first_name} ${driver.last_name}`}
      />

      {/* Salaries Section */}
      <DriverSalariesSection driverId={driver.id} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmExpense} onOpenChange={(open) => !open && setDeleteConfirmExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense?
              {deleteConfirmExpense && (
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <p className="font-medium">{deleteConfirmExpense.name}</p>
                  <p className="text-sm">{deleteConfirmExpense.explanation}</p>
                  <p className="text-sm font-semibold mt-1">{formatCurrency(deleteConfirmExpense.amount)}</p>
                </div>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmExpense) {
                  deleteExpense(deleteConfirmExpense.id);
                  setDeleteConfirmExpense(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
