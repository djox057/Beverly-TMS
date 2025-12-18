import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Fuel, Upload, Loader2, Droplets, DollarSign, FileText, Trash2 } from "lucide-react";
import { useFuelTransactions, getDefaultDateRange, FuelTransactionInsert, FuelFilters } from "@/hooks/useFuelTransactions";
import { format, parse } from "date-fns";
import Papa from "papaparse";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const FuelReports = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultRange = getDefaultDateRange();

  const [filters, setFilters] = useState<FuelFilters>({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    truckNumber: "",
    driverName: "",
    itemType: "ALL",
  });

  const {
    transactions,
    isLoading,
    truckNumbers,
    driverNames,
    itemTypes,
    summary,
    uploadTransactions,
    isUploading,
    deleteAll,
    isDeleting,
  } = useFuelTransactions(filters);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const records: FuelTransactionInsert[] = [];
        
        for (const row of results.data as Record<string, string>[]) {
          // Map CSV columns to database fields
          const truckNumber = row["Unit"]?.trim();
          const driverName = row["Driver Name"]?.trim();
          const transactionNumber = row["Invoice"]?.trim(); // Using Invoice as transaction number
          const tranDateStr = row["Tran Date"]?.trim();
          const item = row["Item"]?.trim();

          // Skip rows missing required fields
          if (!truckNumber || !driverName || !transactionNumber || !tranDateStr || !item) {
            continue;
          }

          // Parse date (format: MM/DD/YYYY)
          let transactionDate: string;
          try {
            const parsedDate = parse(tranDateStr, "MM/dd/yyyy", new Date());
            transactionDate = format(parsedDate, "yyyy-MM-dd");
          } catch {
            console.warn(`Invalid date format: ${tranDateStr}`);
            continue;
          }

          records.push({
            truck_number: truckNumber,
            driver_name: driverName,
            transaction_number: transactionNumber,
            transaction_date: transactionDate,
            location_name: row["Location Name"]?.trim() || null,
            city: row["City"]?.trim() || null,
            state: row["State/Prov"]?.trim() || null,
            fees: parseFloat(row["Fees"]) || 0,
            item: item,
            unit_price: parseFloat(row["Unit Price"]) || 0,
            quantity: parseFloat(row["Qty"]) || 0,
            amount: parseFloat(row["Amt"]) || 0,
          });
        }

        if (records.length === 0) {
          toast({
            title: "No valid records",
            description: "The CSV file did not contain any valid fuel transactions.",
            variant: "destructive",
          });
          return;
        }

        uploadTransactions(records);
      },
      error: (error) => {
        toast({
          title: "Parse error",
          description: error.message,
          variant: "destructive",
        });
      },
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Fuel className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Fuel Reports</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload CSV
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting || transactions.length === 0}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all fuel transactions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {transactions.length} fuel transactions. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteAll()}>Delete All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <DateRangePicker
                date={{
                  from: filters.startDate || undefined,
                  to: filters.endDate || undefined,
                }}
                onDateChange={(range) =>
                  setFilters({
                    ...filters,
                    startDate: range?.from || null,
                    endDate: range?.to || null,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Truck #</Label>
              <Select
                value={filters.truckNumber || "ALL"}
                onValueChange={(value) =>
                  setFilters({ ...filters, truckNumber: value === "ALL" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Trucks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Trucks</SelectItem>
                  {truckNumbers.map((truck) => (
                    <SelectItem key={truck} value={truck}>
                      {truck}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Driver</Label>
              <Select
                value={filters.driverName || "ALL"}
                onValueChange={(value) =>
                  setFilters({ ...filters, driverName: value === "ALL" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Drivers</SelectItem>
                  {driverNames.map((driver) => (
                    <SelectItem key={driver} value={driver}>
                      {driver}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select
                value={filters.itemType}
                onValueChange={(value) => setFilters({ ...filters, itemType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Items</SelectItem>
                  {itemTypes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  setFilters({
                    ...getDefaultDateRange(),
                    truckNumber: "",
                    driverName: "",
                    itemType: "ALL",
                  })
                }
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Fuel className="h-4 w-4" />
              Diesel (ULSD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.dieselGallons)} gal</div>
            <p className="text-sm text-muted-foreground">{formatCurrency(summary.dieselAmount)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              DEF (DEFD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.defGallons)} gal</div>
            <p className="text-sm text-muted-foreground">{formatCurrency(summary.defAmount)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.feesTotal)}</div>
            <p className="text-sm text-muted-foreground">Service fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Other
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.otherAmount)}</div>
            <p className="text-sm text-muted-foreground">Scale, etc.</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Grand Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(summary.grandTotal)}</div>
            <p className="text-sm text-muted-foreground">{summary.transactionCount} transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No fuel transactions found. Upload a CSV file to get started.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Truck #</TableHead>
                    <TableHead>Driver Name</TableHead>
                    <TableHead>Transaction #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">{transaction.truck_number}</TableCell>
                      <TableCell>{transaction.driver_name}</TableCell>
                      <TableCell className="font-mono text-xs">{transaction.transaction_number}</TableCell>
                      <TableCell>
                        {format(new Date(transaction.transaction_date), "MM/dd/yyyy")}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={transaction.location_name || ""}>
                        {transaction.location_name || "-"}
                      </TableCell>
                      <TableCell>{transaction.city || "-"}</TableCell>
                      <TableCell>{transaction.state || "-"}</TableCell>
                      <TableCell className="text-right">
                        {transaction.fees > 0 ? formatCurrency(transaction.fees) : "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            transaction.item === "ULSD"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                              : transaction.item === "DEFD"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {transaction.item}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(transaction.unit_price)}</TableCell>
                      <TableCell className="text-right">{formatNumber(transaction.quantity)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FuelReports;
